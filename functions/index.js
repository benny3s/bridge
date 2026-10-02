/* 베니브릿지 — 요청 이벤트 발생 시 상대에게 FCM 웹 푸시 발송 */
const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const nodeCrypto = require('crypto');
const https = require('https');
admin.initializeApp();
const db = admin.firestore();

/* ── 보안 번호 저장소 공용 헬퍼 (SMS·지인필터 공용) ──
   번호는 서버 전용 키(Secret NUM_ENC_KEY)로 AES-256-GCM 암호화해 잠금 컬렉션에만 저장.
   클라이언트는 규칙상 접근 불가(기본 차단), CF(Admin SDK)만 접근. */
function numKey() {
  const k = process.env.NUM_ENC_KEY || '';
  if (k.length < 64) throw new functions.https.HttpsError('failed-precondition', '서버 키가 설정되지 않았어요.');
  return Buffer.from(k.slice(0, 64), 'hex'); /* 64 hex = 32 bytes */
}
function encPhone(plain) {
  const iv = nodeCrypto.randomBytes(12);
  const cipher = nodeCrypto.createCipheriv('aes-256-gcm', numKey(), iv);
  const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return iv.toString('hex') + ':' + cipher.getAuthTag().toString('hex') + ':' + ct.toString('hex');
}
function decPhone(blob) {
  const parts = String(blob || '').split(':');
  if (parts.length !== 3) return '';
  try {
    const d = nodeCrypto.createDecipheriv('aes-256-gcm', numKey(), Buffer.from(parts[0], 'hex'));
    d.setAuthTag(Buffer.from(parts[1], 'hex'));
    return Buffer.concat([d.update(Buffer.from(parts[2], 'hex')), d.final()]).toString('utf8');
  } catch (e) { return ''; }
}
/* 매칭용 번호 해시 (원본 대신 비교용). 서버 전용 키로 HMAC → 클라이언트로 새어도 역추적 불가 */
function hmacPhone(normalized) {
  return nodeCrypto.createHmac('sha256', numKey()).update(String(normalized)).digest('hex');
}
/* 한국 전화번호 정규화: 하이픈·공백 제거, +82/82 → 0, 최종 0으로 시작하는 숫자열 */
function normPhone(raw) {
  if (!raw) return '';
  let s = String(raw).replace(/[^\d+]/g, '');
  s = s.replace(/^\+/, '');
  if (s.startsWith('82')) s = '0' + s.slice(2); /* +82 / 82 = 앞자리 0 */
  s = s.replace(/\D/g, '');
  if (/^010\d{8}$/.test(s)) return s;      /* 휴대폰 */
  if (/^0\d{8,10}$/.test(s)) return s;     /* 그 외 0으로 시작하는 유효 길이 */
  return '';
}
/* 클라이언트 makePinAuth(PBKDF2-SHA256, 150000, 32byte)와 동일하게 PIN 검증 */
function verifyPinServer(pin, entry) {
  if (!entry) return false;
  const pa = entry.pinAuth;
  if (pa && pa.salt && pa.hash) {
    const salt = Buffer.from(pa.salt, 'base64');
    /* 클라 makePinAuth는 파생 32바이트를 base64로 저장(함수명은 HashHex지만 실제 base64) */
    const h = nodeCrypto.pbkdf2Sync(String(pin), salt, 150000, 32, 'sha256').toString('base64');
    return h === pa.hash;
  }
  if (entry.pinHash) { /* 구형 계정 폴백: sha256(pin) (클라 verifyPin과 동일) */
    const h = nodeCrypto.createHash('sha256').update(String(pin), 'utf8').digest('hex');
    return h === entry.pinHash;
  }
  return false;
}
/* entryId의 인증 주체(본인 or 관리 주선자) 찾기 */
function authEntryFor(state, entry) {
  if (entry && entry.managedBy) {
    return (state.entries || []).find((e) => e.id === entry.managedBy) || entry;
  }
  return entry;
}

/* ── 서버 로그인 (Firebase custom token) ──
   PIN·관리자 비밀번호를 서버에서 확인하고 토큰 발급 → 보안 규칙이 토큰의 신분(claims)으로 접근을 판단.
   claims: 승인 회원 {m:1}, 승인 대기 {p:1}, 관리자 {admin:1}. uid = 회원 entryId / 'admin'.
   대입 공격 방지: 계정별 실패 5회마다 잠금(15분→30분→… 최대 24시간). 잠금 기록은 loginGuard(클라 접근 불가). */
const LOGIN_MAX_FAILS = 5;
const HttpsError = functions.https.HttpsError;
async function loginGuardCheck(key) {
  const ref = db.collection('loginGuard').doc(key);
  const snap = await ref.get();
  const g = snap.exists ? snap.data() : {};
  if (g.lockedUntil && g.lockedUntil > Date.now()) {
    const min = Math.ceil((g.lockedUntil - Date.now()) / 60000);
    throw new HttpsError('resource-exhausted', '여러 번 틀려서 잠시 잠겼어요. ' + min + '분 뒤에 다시 시도해주세요.');
  }
  return { ref, g };
}
async function loginGuardResult(guard, ok) {
  if (ok) { if (guard.g.fails) await guard.ref.delete(); return; }
  const fails = (guard.g.fails || 0) + 1;
  const upd = { fails, lastFailAt: Date.now() };
  if (fails % LOGIN_MAX_FAILS === 0) {
    const mins = Math.min(15 * Math.pow(2, fails / LOGIN_MAX_FAILS - 1), 24 * 60);
    upd.lockedUntil = Date.now() + mins * 60000;
  }
  await guard.ref.set(upd, { merge: true });
}
function guardKey(prefix, id) { return prefix + String(id).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 120); }
/* 비밀(PIN 해시 등)은 secrets/{id}(서버 전용)로 옮겨짐 — state에 남아 있으면(방금 바뀌어 아직 안 옮겨진 값) 그걸 우선.
   계정 전환으로 PIN을 다른 계정에서 물려받는 경우 entry.pinFrom 이 원래 계정 id */
async function pinRecord(id, state) {
  const inline = ((state && state.entries) || []).concat((state && state.pendingEntries) || []).find((e) => e.id === id);
  if (inline && (inline.pinAuth || inline.pinHash)) return { pinAuth: inline.pinAuth || null, pinHash: inline.pinHash || null };
  const sec = (await db.collection('secrets').doc(id).get()).data() || {};
  return { pinAuth: sec.pinAuth || null, pinHash: sec.pinHash || null };
}
async function pinSourceFor(entry, state) {
  if (entry && (entry.pinAuth || entry.pinHash)) return entry;
  let rec = await pinRecord(entry.id, null);
  if (!rec.pinAuth && !rec.pinHash && entry.pinFrom) rec = await pinRecord(entry.pinFrom, state);
  return Object.assign({ id: entry.id }, rec);
}
/* PIN이 필요한 서버 기능(번호 저장·지인 필터) 공통 본인 확인: 서버 로그인 토큰이 그 계정이면 통과,
   아니면 PIN 확인(로그인과 같은 실패 횟수 잠금 적용 — 예전엔 잠금 없이 PIN을 무제한 시도할 수 있었음) */
async function callerOwns(context, state, entry, pin) {
  const authE = authEntryFor(state, entry);
  const c = (context.auth && context.auth.token) || {};
  const uid = context.auth && context.auth.uid;
  if ((c.m === 1 || c.p === 1) && (uid === authE.id || uid === entry.id)) return true;
  if (!pin) return false;
  const guard = await loginGuardCheck(guardKey('m_', authE.id));
  const ok = verifyPinServer(pin, await pinSourceFor(authE, state));
  await loginGuardResult(guard, ok);
  return ok;
}
/* 클라 setupAdminPin/rewrapAdminKey 와 동일: PBKDF2(150000, SHA-256) → AES-256-GCM 으로 감싼 개인키가 풀리면 비밀번호 일치 */
function adminPasswordOk(pw, a) {
  if (!a || !a.salt || !a.iv || !a.wrappedPrivateKey) return false;
  try {
    const key = nodeCrypto.pbkdf2Sync(String(pw), Buffer.from(a.salt, 'base64'), 150000, 32, 'sha256');
    const buf = Buffer.from(a.wrappedPrivateKey, 'base64');
    const d = nodeCrypto.createDecipheriv('aes-256-gcm', key, Buffer.from(a.iv, 'base64'));
    d.setAuthTag(buf.subarray(buf.length - 16));
    Buffer.concat([d.update(buf.subarray(0, buf.length - 16)), d.final()]);
    return true;
  } catch (e) { return false; }
}

exports.memberLogin = functions
  .region('asia-northeast3')
  .runWith({ timeoutSeconds: 20, memory: '256MB' })
  .https.onCall(async (data) => {
    const entryId = String((data && data.entryId) || '');
    const pin = String((data && data.pin) || '');
    if (!entryId || !pin || pin.length > 64) throw new HttpsError('invalid-argument', '닉네임과 PIN을 확인해주세요.');
    const guard = await loginGuardCheck(guardKey('m_', entryId));
    const state = (await db.doc('app/state').get()).data() || {};
    let entry = (state.entries || []).find((e) => e.id === entryId);
    let pending = false;
    if (!entry) { entry = (state.pendingEntries || []).find((e) => e.id === entryId); pending = !!entry; }
    if (!entry) throw new HttpsError('not-found', '계정을 찾을 수 없어요.');
    if (entry.deactivated) throw new HttpsError('failed-precondition', '보관(휴면) 중인 계정이에요. 관리자에게 문의해주세요.');
    if (entry.managedBy && entry.pinExpiresAt && Date.now() > new Date(entry.pinExpiresAt).getTime()) {
      throw new HttpsError('failed-precondition', '임시 PIN이 만료됐어요. 주선자에게 다시 받아주세요.');
    }
    const src = await pinSourceFor(entry, state);
    const ok = verifyPinServer(pin, src);
    await loginGuardResult(guard, ok);
    if (!ok) throw new HttpsError('permission-denied', 'PIN이 올바르지 않아요.');
    if (!src.pinAuth && src.pinHash) {
      /* 옛 방식(솔트 없는 sha256) → PBKDF2로 올림 (서버 전용 금고에만 저장) */
      const salt = nodeCrypto.randomBytes(16);
      const hash = nodeCrypto.pbkdf2Sync(pin, salt, 150000, 32, 'sha256').toString('base64');
      await db.collection('secrets').doc(entryId).set({ pinAuth: { v: 2, salt: salt.toString('base64'), hash }, pinHash: admin.firestore.FieldValue.delete() }, { merge: true }).catch(() => {});
    }
    const token = await admin.auth().createCustomToken(entryId, pending ? { p: 1 } : { m: 1 });
    return { token, pending };
  });

exports.adminLogin = functions
  .region('asia-northeast3')
  .runWith({ timeoutSeconds: 20, memory: '256MB' })
  .https.onCall(async (data) => {
    const pw = String((data && data.password) || '');
    if (!pw || pw.length > 128) throw new HttpsError('invalid-argument', '비밀번호를 확인해주세요.');
    const guard = await loginGuardCheck('admin');
    const st = ((await db.doc('app/state').get()).data() || {}).adminAuth;
    const a = (st && st.wrappedPrivateKey) ? st : (await db.collection('adminKey').doc('main').get()).data();
    const ok = adminPasswordOk(pw, a);
    await loginGuardResult(guard, ok);
    if (!ok) throw new HttpsError('permission-denied', '비밀번호가 올바르지 않아요.');
    const token = await admin.auth().createCustomToken('admin', { admin: 1 });
    return { token };
  });

/* 회원 전화번호를 안전 저장 (가입/수정 시 클라이언트가 호출). PIN 검증으로 본인만 저장 가능. */
exports.savePhone = functions
  .region('asia-northeast3')
  .runWith({ secrets: ['NUM_ENC_KEY'], timeoutSeconds: 20, memory: '256MB' })
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', '로그인이 필요해요.');
    const entryId = String((data && data.entryId) || '');
    const pin = String((data && data.pin) || '');
    const phone = normPhone(data && data.phone);
    if (!entryId) throw new functions.https.HttpsError('invalid-argument', '정보가 부족해요.');
    if (!phone) throw new functions.https.HttpsError('invalid-argument', '전화번호 형식이 올바르지 않아요.');
    const snap = await db.doc('app/state').get();
    const state = snap.data() || {};
    const entry = (state.entries || []).concat(state.pendingEntries || []).find((e) => e.id === entryId);
    if (!entry) throw new functions.https.HttpsError('not-found', '계정을 찾을 수 없어요.');
    if (!(await callerOwns(context, state, entry, pin))) {
      throw new functions.https.HttpsError('permission-denied', 'PIN이 올바르지 않아요.');
    }
    await db.doc('sendContacts/' + entryId).set({ enc: encPhone(phone), ph: hmacPhone(phone), at: new Date().toISOString() });
    return { ok: true };
  });

/* 지인 필터 설정: 사용자가 올린 번호(연락처)를 정규화·해시해 저장. mode append(기본)/replace.
   원본 번호는 저장하지 않고 HMAC만 보관 → 상대 번호를 알 필요 없이 매칭만 가능. */
exports.setAcqFilter = functions
  .region('asia-northeast3')
  .runWith({ secrets: ['NUM_ENC_KEY'], timeoutSeconds: 30, memory: '256MB' })
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', '로그인이 필요해요.');
    const entryId = String((data && data.entryId) || '');
    const pin = String((data && data.pin) || '');
    const mode = (data && data.mode) === 'replace' ? 'replace' : 'append';
    const numbers = Array.isArray(data && data.numbers) ? data.numbers : [];
    if (!entryId) throw new functions.https.HttpsError('invalid-argument', '정보가 부족해요.');
    const snap = await db.doc('app/state').get();
    const state = snap.data() || {};
    const entry = (state.entries || []).find((e) => e.id === entryId);
    if (!entry) throw new functions.https.HttpsError('not-found', '계정을 찾을 수 없어요.');
    if (!(await callerOwns(context, state, entry, pin))) {
      throw new functions.https.HttpsError('permission-denied', 'PIN이 올바르지 않아요.');
    }
    const myPh = ((await db.doc('sendContacts/' + entryId).get()).data() || {}).ph || null;
    const newHashes = [];
    numbers.forEach((n) => { const nn = normPhone(n); if (nn) { const h = hmacPhone(nn); if (h !== myPh) newHashes.push(h); } }); /* 내 번호는 제외 */
    const ref = db.doc('acqFilter/' + entryId);
    let fh = newHashes;
    if (mode === 'append') {
      const cur = (await ref.get()).data();
      fh = (cur && Array.isArray(cur.fh)) ? cur.fh.slice() : [];
      newHashes.forEach((h) => { if (fh.indexOf(h) < 0) fh.push(h); });
    } else {
      fh = Array.from(new Set(newHashes));
    }
    if (fh.length > 5000) fh = fh.slice(0, 5000);
    await ref.set({ fh: fh, at: new Date().toISOString() });
    /* 관리자 표 표시용: 회원 entry에 지인필터 개수 저장(숫자만, 대상은 비공개) */
    await db.runTransaction(async (tx) => {
      const sd = await tx.get(db.doc('app/state'));
      const s = sd.data() || {};
      const entries = (s.entries || []).map((e) => e.id === entryId ? Object.assign({}, e, { acqFilterCount: fh.length }) : e);
      tx.update(db.doc('app/state'), { entries: entries });
    }).catch(function () {});
    return { ok: true, count: fh.length, matchedNew: newHashes.length };
  });

/* 지인 필터 전체 삭제 (내가 건 필터만 삭제. 상대가 나를 걸어둔 건 그대로 → 서로 안 보일 수 있음) */
exports.clearAcqFilter = functions
  .region('asia-northeast3')
  .runWith({ secrets: ['NUM_ENC_KEY'], timeoutSeconds: 20, memory: '256MB' })
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', '로그인이 필요해요.');
    const entryId = String((data && data.entryId) || '');
    const pin = String((data && data.pin) || '');
    if (!entryId) throw new functions.https.HttpsError('invalid-argument', '정보가 부족해요.');
    const snap = await db.doc('app/state').get();
    const state = snap.data() || {};
    const entry = (state.entries || []).find((e) => e.id === entryId);
    if (!entry) throw new functions.https.HttpsError('not-found', '계정을 찾을 수 없어요.');
    if (!(await callerOwns(context, state, entry, pin))) {
      throw new functions.https.HttpsError('permission-denied', 'PIN이 올바르지 않아요.');
    }
    await db.doc('acqFilter/' + entryId).delete().catch(function () {});
    await db.runTransaction(async (tx) => {
      const sd = await tx.get(db.doc('app/state'));
      const s = sd.data() || {};
      const entries = (s.entries || []).map((e) => e.id === entryId ? Object.assign({}, e, { acqFilterCount: 0 }) : e);
      tx.update(db.doc('app/state'), { entries: entries });
    }).catch(function () {});
    return { ok: true };
  });

/* 내 명단에서 숨길 회원 ID 목록 (양방향): 내가 건 사람 + 나를 건 사람. 블록 관계는 노출 안 함(ID만 반환) */
exports.getHiddenIds = functions
  .region('asia-northeast3')
  .runWith({ secrets: ['NUM_ENC_KEY'], timeoutSeconds: 30, memory: '256MB' })
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', '로그인이 필요해요.');
    const entryId = String((data && data.entryId) || '');
    const pin = String((data && data.pin) || '');
    if (!entryId) throw new functions.https.HttpsError('invalid-argument', '정보가 부족해요.');
    const snap = await db.doc('app/state').get();
    const state = snap.data() || {};
    const entry = (state.entries || []).find((e) => e.id === entryId);
    if (!entry) throw new functions.https.HttpsError('not-found', '계정을 찾을 수 없어요.');
    if (!(await callerOwns(context, state, entry, pin))) {
      throw new functions.https.HttpsError('permission-denied', 'PIN이 올바르지 않아요.');
    }
    const myFilter = (await db.doc('acqFilter/' + entryId).get()).data() || {};
    const myFh = new Set(Array.isArray(myFilter.fh) ? myFilter.fh : []);
    const myPh = ((await db.doc('sendContacts/' + entryId).get()).data() || {}).ph || null;
    const hide = new Set();
    /* 내가 건 사람: 그 회원의 번호해시가 내 필터에 있음 */
    if (myFh.size) {
      const sc = await db.collection('sendContacts').get();
      sc.forEach((d) => { const p = (d.data() || {}).ph; if (d.id !== entryId && p && myFh.has(p)) hide.add(d.id); });
    }
    /* 나를 건 사람: 그 회원의 필터에 내 번호해시가 있음 */
    if (myPh) {
      const q = await db.collection('acqFilter').where('fh', 'array-contains', myPh).get();
      q.forEach((d) => { if (d.id !== entryId) hide.add(d.id); });
    }
    return { ids: Array.from(hide), filterCount: myFh.size, hiddenCount: hide.size };
  });

/* (adminBackfill: 기존 회원 번호 일괄 백필 — 2026-09-08 완료 후 제거. 필요 시 재도입) */

const SITE_URL = 'https://benny3s.github.io/bridge/';

function reqStatus(r) {
  if (r.approved) return 'approved';
  if (r.rejected) return 'rejected';
  if (r.held) return 'held';
  if (r.userApproved) return 'user_approved';
  return 'pending';
}
function nameOf(entries, id) {
  const e = (entries || []).find((x) => x.id === id);
  return e ? e.nickname : '상대방';
}
/* 대리(주선자 관리) 친구가 '직접 로그인 가능한' 상태인지 = 유효한 임시 PIN 보유.
   (클라이언트 subPinExpired 와 동일 규칙: 만료시각 없으면 만료 취급 안 함) */
function subPinActive(e) {
  if (!e || !e.pinAuth) return false;
  if (!e.pinExpiresAt) return true;
  return Date.now() <= new Date(e.pinExpiresAt).getTime();
}
async function tokensFor(id) {
  if (!id) return [];
  try {
    const doc = await db.collection('pushTokens').doc(id).get();
    if (!doc.exists) return [];
    const t = doc.data().tokens;
    if (Array.isArray(t)) return t;
    if (t && typeof t === 'object') return Object.keys(t);
    return [];
  } catch (e) { return []; }
}
async function sendToTokens(tokens, title, body, cleanupIds, nav) {
  if (!tokens.length) return;
  try {
    /* data-only: 서비스워커가 직접 알림을 만들어 중복 표시를 막음 */
    const res = await admin.messaging().sendEachForMulticast({
      tokens: tokens,
      /* nav: 알림을 누르면 앱이 갈 곳 — route(mine/dm…)·focusId(요청 id)·actAs(주선자가 전환할 친구 id) */
      data: Object.assign({ title: title, body: body, url: SITE_URL }, navData(nav)),
      webpush: { headers: { Urgency: 'high', TTL: '86400' } }
    });
    const bad = [];
    res.responses.forEach((r, i) => {
      if (!r.success) {
        const c = r.error && r.error.code;
        if (c === 'messaging/registration-token-not-registered' ||
            c === 'messaging/invalid-argument' ||
            c === 'messaging/invalid-registration-token') bad.push(tokens[i]);
      }
    });
    if (bad.length && cleanupIds && cleanupIds.length) {
      for (const cid of cleanupIds) {
        try {
          await db.collection('pushTokens').doc(cid)
            .set({ tokens: admin.firestore.FieldValue.arrayRemove.apply(null, bad) }, { merge: true });
        } catch (e) {}
      }
    }
  } catch (e) { console.error('push send failed', e); }
}
function navData(nav) {
  const o = {};
  if (nav && nav.route) o.route = String(nav.route);
  if (nav && nav.focusId) o.focusId = String(nav.focusId);
  if (nav && nav.actAs) o.actAs = String(nav.actAs);
  return o;
}
async function sendTo(id, title, body, nav) {
  const tokens = await tokensFor(id);
  await sendToTokens(tokens, title, body, [id], nav);
}
function entryById(entries, id) {
  return (entries || []).find((x) => x.id === id) || null;
}
/* 수신자에게 알림. 대리 등록(주선자 관리) 프로필이면 주선자에게 대신 보냄. */
async function notifyRecipient(entries, id, title, body, nav) {
  const e = entryById(entries, id);
  /* 보관(휴면) 계정에는 회원 간 알림(요청·재요청·결정·채팅·리마인더)을 보내지 않음 — 로그인도 불가.
     (옛 버전 앱에서 요청이 들어와도 푸시는 안 감. 다시 활성화되면 정상 발송) */
  if (e && e.deactivated) return;
  if (e && e.managedBy) {
    /* 대리(주선자 관리) 친구: 주선자에게 항상 전달(소개 대상 본인은 앱에 없을 수 있음).
       + 친구가 유효한 임시 PIN으로 직접 쓰는 상태면 친구 본인에게도 (토큰 없으면 자동 무시) */
    /* 주선자가 누르면 그 친구로 전환돼 열리게 actAs */
    const jobs = [sendTo(e.managedBy, title, '[소개: ' + (e.nickname || '') + '] ' + body, Object.assign({}, nav, { actAs: id }))];
    if (subPinActive(e)) jobs.push(sendTo(id, title, body, nav));
    await Promise.all(jobs);
  } else {
    /* 독립(자기 등록) 계정 → 본인에게 */
    await sendTo(id, title, body, nav);
  }
}
/* 관리자에게: pushTokens/admin 에 등록된 기기들 (관리자 페이지의 알림 토글로 기기별 관리) */
async function sendToAdmin(title, body) {
  const tokens = await tokensFor('admin');
  await sendToTokens(tokens, title, body, ['admin']);
}

exports.onStateChange = functions
  .region('asia-northeast3')
  .runWith({ maxInstances: 10, timeoutSeconds: 120, memory: '256MB' })
  .firestore.document('app/state')
  .onUpdate(async (change) => {
    const before = change.before.data() || {};
    const after = change.after.data() || {};
    const entries = after.entries || [];
    const beforeMap = {};
    (before.dateRequests || []).forEach((r) => { beforeMap[r.id] = r; });

    const jobs = [];
    jobs.push(syncPublicView(after).catch((e) => console.error('syncPublicView', e)));
    jobs.push(sweepSecrets(before, after).catch((e) => console.error('sweepSecrets', e)));
    jobs.push(migrateDmToChats(after).catch((e) => console.error('migrateDmToChats', e)));
    jobs.push(refreshChatViewers(before, after).catch((e) => console.error('refreshChatViewers', e)));
    jobs.push(syncPhotoAcl(after, false).catch((e) => console.error('syncPhotoAcl', e)));
    (after.dateRequests || []).forEach((r) => {
      const prev = beforeMap[r.id];
      const type = (r.type || 'contact') === 'photo' ? '사진' : '대화'; /* 앱 용어(대화 신청)와 통일 */
      const nav = { route: 'mine', focusId: r.id };
      if (!prev) {
        /* 새 요청 → 받는 사람에게 (대리 프로필이면 주선자에게) */
        jobs.push(notifyRecipient(entries, r.toId, '새 ' + type + ' 요청', nameOf(entries, r.fromId) + '님이 ' + type + ' 요청을 보냈어요', nav));
      } else {
        /* 요청자가 자기 사진을 공개함 → 받는 사람에게 */
        if (!prev.fromRevealed && r.fromRevealed) {
          jobs.push(notifyRecipient(entries, r.toId, '📷 사진 공개', nameOf(entries, r.fromId) + '님이 자기 사진을 공개했어요', nav));
        }
        const ps = reqStatus(prev), ns = reqStatus(r);
        if (ps === ns) return;
        /* approved 와 user_approved(당사자 승인·관리자 확정 대기) 를 하나의 "승인" 이벤트로 취급해 중복 알림 방지 */
        const wasApproved = (ps === 'approved' || ps === 'user_approved');
        const isApproved = (ns === 'approved' || ns === 'user_approved');
        if (isApproved && !wasApproved) jobs.push(notifyRecipient(entries, r.fromId, type + ' 요청 승인 🎉', nameOf(entries, r.toId) + '님이 요청을 승인했어요', nav));
        else if (ns === 'held' && ps !== 'held') jobs.push(notifyRecipient(entries, r.fromId, type + ' 요청 보류', nameOf(entries, r.toId) + '님이 요청을 보류했어요', nav));
        else if (ns === 'rejected' && ps !== 'rejected') jobs.push(notifyRecipient(entries, r.fromId, type + ' 요청 거절', nameOf(entries, r.toId) + '님이 요청을 거절했어요', nav));
        else if (ns === 'pending' && (ps === 'held' || ps === 'rejected')) jobs.push(notifyRecipient(entries, r.toId, type + ' 재요청', nameOf(entries, r.fromId) + '님이 정보를 담아 다시 요청했어요', nav));
      }
    });

    /* 새 신청서(승인 대기) → 관리자에게 */
    const beforePend = {};
    (before.pendingEntries || []).forEach((p) => { beforePend[p.id] = true; });
    (after.pendingEntries || []).forEach((p) => {
      if (!beforePend[p.id]) jobs.push(sendToAdmin('새 신청서 📝', (p.nickname || '누군가') + '님이 신청서를 냈어요 (승인 대기)'));
    });

    /* 주선자 요청(joinRequests): 새 요청 → 주선자에게 / 승인(회원이 managedBy 얻음) → 회원에게 */
    const beforeJoin = {};
    (before.joinRequests || []).forEach((j) => { beforeJoin[j.id] = true; });
    (after.joinRequests || []).forEach((j) => {
      if (!beforeJoin[j.id]) jobs.push(sendTo(j.toId, '🤝 새 주선자 요청', (j.fromNick || '누군가') + '님이 주선자로 관리해 달라고 요청했어요', { route: 'mine' }));
    });
    const beforeEntryMap = {};
    (before.entries || []).forEach((e) => { beforeEntryMap[e.id] = e; });
    (after.entries || []).forEach((e) => {
      const prev = beforeEntryMap[e.id];
      /* 주선자 요청 승인으로 관리 대상이 된 경우에만 알림.
         본인이 주선자로 전환하면 자기 프로필이 ownerSelf 관리 프로필이 되는데(=자기 자신), 그건 승인이 아니므로 제외 */
      if (prev && !prev.managedBy && e.managedBy && !e.ownerSelf) {
        jobs.push(sendTo(e.id, '🤝 주선자 요청 승인', '주선자님이 요청을 승인했어요. 이제 함께 관리돼요'));
      }
    });

    /* 새 메시지 → 상대에게 (회원→관리자 / 관리자→회원) */
    const nickAny = (id) => {
      const e = (after.entries || []).find((x) => x.id === id) || (after.pendingEntries || []).find((x) => x.id === id);
      return e ? e.nickname : '회원';
    };
    const beforeMsg = {};
    (before.messages || []).forEach((m) => { beforeMsg[m.id] = true; });
    (after.messages || []).forEach((m) => {
      if (beforeMsg[m.id]) return;
      const preview = (m.text || '').slice(0, 40);
      if (m.from === 'user') jobs.push(sendToAdmin('💬 새 Q&A/메시지', nickAny(m.entryId) + ': ' + preview));
      /* 대리(주선자 관리) 친구에게 온 관리자 메시지도 주선자에게 전달 (예전엔 친구 기기로만 → 대개 유실) */
      else if (m.from === 'admin') {
        const me2 = entryById(after.entries || [], m.entryId);
        if (me2 && me2.managedBy) jobs.push(notifyRecipient(after.entries || [], m.entryId, '💬 관리자 메시지', preview, { route: 'mine' }));
        else jobs.push(sendTo(m.entryId, '💬 관리자 메시지', preview, { route: 'mine' }));
      }
    });

    /* 회원↔회원 데이트 채팅(dm): 새 메시지 → 받는 사람에게 (대리 프로필이면 주선자에게) */
    const beforeDm = {};
    (before.dm || []).forEach((m) => { beforeDm[m.id] = true; });
    (after.dm || []).forEach((m) => {
      if (beforeDm[m.id]) return;
      const preview = (m.text || '').slice(0, 40);
      jobs.push(notifyRecipient(entries, m.toId, '💬 ' + nameOf(entries, m.fromId) + '님의 채팅', preview, { route: 'dm', focusId: m.fromId }));
    });

    await Promise.all(jobs);
    return null;
  });

/* 미응답(pending) 사진/번호 요청 리마인더 — 1일차·3일차 딱 2회만 재알림.
   remind1Sent / remind2Sent 플래그로 중복 방지. 이후는 관리자가 직접 챙김. */
const REMIND_1_MS = 24 * 60 * 60 * 1000; /* 1일 */
const REMIND_2_MS = 72 * 60 * 60 * 1000; /* 3일 */
const REMIND_3_MS = 7 * 24 * 60 * 60 * 1000; /* 7일 — 앱 관리자 메시지 1회(메시지함에 남음) */

exports.remindPending = functions
  .region('asia-northeast3')
  .runWith({ timeoutSeconds: 60, memory: '256MB' })
  .pubsub.schedule('every 1 hours')
  .timeZone('Asia/Seoul')
  .onRun(async () => {
    const ref = db.doc('app/state');
    /* 플래그 갱신은 트랜잭션으로(동시 요청 arrayUnion 과의 경쟁 최소화), 푸시 발송은 커밋 후 */
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      const state = snap.data() || {};
      const entries = state.entries || [];
      const reqs = state.dateRequests || [];
      const now = Date.now();
      const sends = [];
      const newMsgs = [];
      let changed = false;
      const updated = reqs.map((r) => {
        if (reqStatus(r) !== 'pending') return r;
        /* 받는 사람이 보관(휴면) 중이면 리마인더·자동 메시지 모두 건너뜀(요청은 일시정지 상태로 보존) */
        const toE = entryById(entries, r.toId);
        if (toE && toE.deactivated) return r;
        const t = r.submittedAt ? new Date(r.submittedAt).getTime() : 0;
        if (!t) return r;
        const age = now - t;
        const type = (r.type || 'contact') === 'photo' ? '사진' : '대화';
        const fromNick = nameOf(entries, r.fromId);
        /* 7일+ 무응답: 앱 관리자 메시지 1회(메시지함에 남아 반드시 봄 · onStateChange가 푸시도 보냄). remind3Sent로 중복 방지 */
        if (age >= REMIND_3_MS && !r.remind3Sent) {
          newMsgs.push({ id: nodeCrypto.randomUUID(), entryId: r.toId, from: 'admin', text: '[베니브릿지] 확인 대기 중인 요청이 있어요. 앱에서 승인·보류·거절을 정해주세요 🙏', at: new Date().toISOString() });
          changed = true;
          return Object.assign({}, r, { remind1Sent: true, remind2Sent: true, remind3Sent: true });
        }
        if (age >= REMIND_2_MS && !r.remind2Sent) {
          sends.push({ toId: r.toId, reqId: r.id, title: '⏰ ' + type + ' 요청 알림', body: fromNick + '님의 ' + type + ' 요청이 3일째 기다리고 있어요. 승인/거절을 정해주세요' });
          changed = true;
          return Object.assign({}, r, { remind1Sent: true, remind2Sent: true });
        }
        if (age >= REMIND_1_MS && !r.remind1Sent) {
          sends.push({ toId: r.toId, reqId: r.id, title: '⏰ ' + type + ' 요청 알림', body: fromNick + '님의 ' + type + ' 요청이 아직 대기 중이에요. 확인해주세요' });
          changed = true;
          return Object.assign({}, r, { remind1Sent: true });
        }
        return r;
      });
      if (changed) {
        const upd = { dateRequests: updated };
        if (newMsgs.length) upd.messages = (state.messages || []).concat(newMsgs);
        tx.update(ref, upd);
      }
      return { entries, sends };
    });
    if (result && result.sends.length) {
      await Promise.all(result.sends.map((s) => notifyRecipient(result.entries, s.toId, s.title, s.body, { route: 'mine', focusId: s.reqId || '' })));
    }
    await purgeDeletedSecrets().catch((e) => console.error('purgeDeletedSecrets', e));
    if (new Date().getUTCHours() === 19) {
      await purgeOldChats().catch((e) => console.error('purgeOldChats', e)); /* 매일 KST 04시 */
      const st = (await db.doc('app/state').get()).data() || {};
      await syncPhotoAcl(st, true).catch((e) => console.error('syncPhotoAcl(force)', e)); /* 사진 열람 목록 하루 한 번 전체 재기록 */
    }
    return null;
  });

/* ── 관리자 수동 SMS 발송 (Solapi) ──
   푸시가 안 닿는 사람(앱 미접속·알림 off)을 되돌리는 fallback. 관리자가 대상 보고 직접 발송.
   인증: 관리자 전용 토큰(SMS_ADMIN_TOKEN). 번호는 서버가 sendContacts에서 복호화 → 관리자는 번호를 보지 않음.
   입력: { token, sends:[{entryId, text}] } (최대 100). 항목별 결과 반환. 발송 이력 기록은 클라이언트가 함. */
function solapiSend(apiKey, apiSecret, from, to, text) {
  return new Promise((resolve) => {
    const date = new Date().toISOString();
    const salt = nodeCrypto.randomBytes(32).toString('hex');
    const signature = nodeCrypto.createHmac('sha256', apiSecret).update(date + salt).digest('hex');
    const message = { to: to, from: from, text: text };
    if (Buffer.byteLength(text, 'utf8') > 90) { message.type = 'LMS'; message.subject = '베니브릿지'; } else { message.type = 'SMS'; }
    const body = JSON.stringify({ message: message });
    const req = https.request({
      hostname: 'api.solapi.com',
      path: '/messages/v4/send',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Authorization': 'HMAC-SHA256 apiKey=' + apiKey + ', date=' + date + ', salt=' + salt + ', signature=' + signature
      }
    }, (res) => {
      let chunks = '';
      res.on('data', (d) => { chunks += d; });
      res.on('end', () => {
        let json = null; try { json = JSON.parse(chunks); } catch (e) {}
        const ok = res.statusCode >= 200 && res.statusCode < 300 && json && !json.errorCode;
        resolve({ ok: ok, status: res.statusCode, detail: json ? (json.statusMessage || json.errorMessage || json.errorCode || String(res.statusCode)) : String(chunks).slice(0, 200) });
      });
    });
    req.on('error', (e) => resolve({ ok: false, status: 0, detail: String((e && e.message) || e) }));
    req.write(body); req.end();
  });
}

exports.adminSendSms = functions
  .region('asia-northeast3')
  .runWith({ secrets: ['NUM_ENC_KEY', 'SOLAPI_KEY', 'SOLAPI_SECRET', 'SOLAPI_SENDER', 'SMS_ADMIN_TOKEN'], timeoutSeconds: 120, memory: '256MB' })
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', '로그인이 필요해요.');
    const token = String((data && data.token) || '');
    const adminTok = process.env.SMS_ADMIN_TOKEN || '';
    if (!adminTok || token !== adminTok) throw new functions.https.HttpsError('permission-denied', '관리자 토큰이 올바르지 않아요.');
    const apiKey = process.env.SOLAPI_KEY || '';
    const apiSecret = process.env.SOLAPI_SECRET || '';
    const from = normPhone(process.env.SOLAPI_SENDER || '');
    if (!apiKey || !apiSecret || !from) throw new functions.https.HttpsError('failed-precondition', 'SMS 발송 설정(SOLAPI_*)이 아직 안 됐어요.');
    let sends = Array.isArray(data && data.sends) ? data.sends : [];
    if (!sends.length) throw new functions.https.HttpsError('invalid-argument', '보낼 대상이 없어요.');
    if (sends.length > 100) sends = sends.slice(0, 100);
    const results = [];
    for (const s of sends) {
      const entryId = String((s && s.entryId) || '');
      const text = String((s && s.text) || '').trim();
      if (!entryId || !text) { results.push({ entryId: entryId, ok: false, detail: '정보 부족' }); continue; }
      let phone = '';
      try { const sc = (await db.doc('sendContacts/' + entryId).get()).data(); phone = sc ? decPhone(sc.enc) : ''; } catch (e) { phone = ''; }
      if (!phone) { results.push({ entryId: entryId, ok: false, detail: '저장된 번호 없음' }); continue; }
      const r = await solapiSend(apiKey, apiSecret, from, phone, text);
      results.push({ entryId: entryId, ok: r.ok, detail: r.detail });
    }
    const okCount = results.filter((r) => r.ok).length;
    return { ok: okCount, fail: results.length - okCount, results: results };
  });

/* ══ 2단계: 손님·승인대기용 공개 요약 + 신청자 쓰기 대행 ══
   보안 규칙상 app/state 는 승인 회원·관리자만 읽고 쓸 수 있음. 손님 화면은 app/public(요약)으로 그리고,
   손님·승인대기의 쓰기(가입 신청·문의·PIN 재설정 요청·신청서 수정/철회)는 applicantAction 이 대신 처리. */
function clip(s, n) { return String(s == null ? '' : s).replace(/\s+/g, ' ').slice(0, n); }
function roundHour(iso) {
  const t = iso ? new Date(iso).getTime() : 0;
  return t ? new Date(Math.floor(t / 3600000) * 3600000).toISOString() : null;
}
function buildPublicView(state) {
  const entries = state.entries || [];
  const byId = {}; entries.forEach((e) => { byId[e.id] = e; });
  const lastOf = (e) => { let v = e.lastSeenAt; if (e.managedBy && byId[e.managedBy] && byId[e.managedBy].lastSeenAt) v = byId[e.managedBy].lastSeenAt; return v || e.submittedAt || null; };
  /* 티저: 승인 회원 중 명단 노출 대상. 신원 연결 안 되게 닉네임·id·사진 없음, 소개는 앞 18자만 */
  const teaser = entries.filter((e) => !e.isMatchmaker && !e.deactivated && !e.testAccount).map((e, i) => ({
    id: 't' + i, gender: e.gender || '', birthYear: e.birthYear || null, region: clip(e.region, 20),
    intro: clip(e.intro, 18), idealType: clip(e.idealType, 18),
    submittedAt: e.submittedAt || null, lastSeenAt: roundHour(lastOf(e)), serial: e.serial || null
  }));
  /* 로그인 목록·닉네임 중복 확인용 (기존 로그인 창에 이미 보이던 수준) */
  const dirOf = (e, pending) => {
    const d = { id: e.id, nickname: e.nickname || '', serial: e.serial || null, submittedAt: e.submittedAt || null, pinOn: !!(e.pinAuth || e.pinHash || e.pinSet) };
    if (pending) d.pending = true;
    ['deactivated', 'isMatchmaker', 'ownerSelf', 'testAccount'].forEach((k) => { if (e[k]) d[k] = true; });
    if (e.managedBy) d.managedBy = e.managedBy;
    if (e.pinExpiresAt) d.pinExpiresAt = e.pinExpiresAt;
    return d;
  };
  const loginDir = entries.map((e) => dirOf(e, false)).concat((state.pendingEntries || []).map((e) => dirOf(e, true)));
  const reports = state.coupleReports || [];
  const reviews = reports.filter((r) => r.confirmed && r.review && (r.vis === 'public' || r.vis === 'anon'))
    .map((r) => ({ confirmed: true, review: clip(r.review, 300), vis: r.vis, byNick: r.vis === 'public' ? (r.byNick || '') : '', partner: r.vis === 'public' ? (r.partner || '') : '', confirmedAt: r.confirmedAt || null, at: r.at || null }));
  const connNow = (state.dateRequests || []).filter((r) => (r.type || 'contact') === 'contact' && r.approved).length;
  return {
    v: 1,
    appVersion: state.appVersion || '',
    announce: state.announce || null,
    popup: state.popup || null,
    adminPub: (state.adminAuth && state.adminAuth.publicKeyJwk) || null,
    teaser, loginDir, reviews,
    connCount: Array.isArray(state.connLog) ? state.connLog.length : Math.max(typeof state.connEver === 'number' ? state.connEver : 0, connNow),
    coupleCount: reports.filter((r) => r.confirmed).length,
    /* 누적 가입 = 승인된 계정(주선자·보관 포함, 테스트 제외). 주선자의 본인 프로필(ownerSelf)은 같은 사람이라 중복 제외 */
    memberTotal: entries.filter((e) => !e.testAccount && !(e.managedBy && e.ownerSelf)).length
  };
}
async function syncPublicView(state) {
  const view = buildPublicView(state);
  const h = nodeCrypto.createHash('sha1').update(JSON.stringify(view)).digest('hex');
  const ref = db.doc('app/public');
  const cur = await ref.get();
  if (cur.exists && cur.data().h === h) return;
  await ref.set(Object.assign({ h, updatedAt: new Date().toISOString() }, view));
}

/* ── 신청자 쓰기 대행 ── */
const ENTRY_TEXT_LIMITS = { nickname: 20, region: 40, workplace: 60, height: 10, intro: 1000, idealType: 600, dealbreaker: 600, degreeChoice: 20 };
const ENC_FIELDS = ['realNameEnc', 'contactEnc', 'referrerEnc', 'contactSelfEnc'];
function isSmallObj(v, max) { return !!v && typeof v === 'object' && JSON.stringify(v).length <= (max || 8000); }
function cleanPinAuth(p) {
  if (!p || typeof p !== 'object') return null;
  if (typeof p.salt !== 'string' || typeof p.hash !== 'string' || p.salt.length > 64 || p.hash.length > 128) return null;
  return { v: 2, salt: p.salt, hash: p.hash };
}
/* 클라가 보낸 프로필 필드 중 허용된 것만 골라 검증 (managedBy·testAccount·승인 관련 필드는 절대 받지 않음) */
function pickProfile(src, kind) {
  const out = {};
  if (typeof src.nickname === 'string') out.nickname = src.nickname.trim().slice(0, ENTRY_TEXT_LIMITS.nickname);
  ENC_FIELDS.forEach((k) => { if (isSmallObj(src[k])) out[k] = src[k]; });
  if (kind === 'mm') return out;
  ['region', 'workplace', 'height', 'intro', 'idealType', 'dealbreaker', 'degreeChoice'].forEach((k) => {
    if (typeof src[k] === 'string') out[k] = src[k].trim().slice(0, ENTRY_TEXT_LIMITS[k]);
  });
  if (src.gender === 'male' || src.gender === 'female') out.gender = src.gender;
  const by = parseInt(src.birthYear, 10);
  if (by >= 1900 && by <= new Date().getFullYear() - 19) out.birthYear = by;
  if (typeof src.photoThumb === 'string' && /^data:image\//.test(src.photoThumb) && src.photoThumb.length <= 120000) out.photoThumb = src.photoThumb;
  else if (src.photoThumb === null) out.photoThumb = null;
  const pc = parseInt(src.photoCount, 10);
  if (pc >= 0 && pc <= 3) out.photoCount = pc;
  if (typeof src.blurPhoto === 'boolean') out.blurPhoto = src.blurPhoto;
  return out;
}
function cleanPhotos(photos) {
  if (photos == null) return null;
  if (!Array.isArray(photos) || photos.length > 3) throw new HttpsError('invalid-argument', '사진은 최대 3장이에요.');
  let total = 0;
  photos.forEach((p) => {
    if (typeof p !== 'string' || !/^data:image\//.test(p)) throw new HttpsError('invalid-argument', '사진 형식이 올바르지 않아요.');
    total += p.length;
  });
  if (total > 1000000) throw new HttpsError('invalid-argument', '사진 용량이 너무 커요.');
  return photos;
}
function nickTaken(state, nickname, exceptId) {
  const n = String(nickname || '').trim().toLowerCase();
  const all = (state.entries || []).concat(state.pendingEntries || []);
  /* 주선자 본인 프로필 ↔ 주선자 계정은 같은 닉네임 허용 (클라 nickExemptIds 와 같은 취지) */
  const exempt = {};
  (state.entries || []).forEach((e) => { if (e.managedBy && e.ownerSelf) { exempt[e.id] = 1; exempt[e.managedBy] = 1; } });
  return all.some((e) => e.id !== exceptId && !exempt[e.id] && (e.nickname || '').trim().toLowerCase() === n);
}
function logItem(type, actor, detail) { return { id: nodeCrypto.randomUUID(), at: new Date().toISOString(), type, actor: actor || '', detail: detail || '' }; }
/* 손님 쓰기(가입·문의·PIN 요청) 남용 방지: 접속 IP 기준 시간당 횟수 제한 */
async function rateLimit(context, key, maxPerHour) {
  const req = context.rawRequest || {};
  const ip = String(req.ip || (req.headers && req.headers['x-forwarded-for']) || 'unknown').split(',')[0].trim();
  const ref = db.collection('rateLimit').doc(guardKey(key + '_', ip));
  await db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    const now = Date.now();
    const hits = (s.exists ? (s.data().hits || []) : []).filter((t) => now - t < 3600000);
    if (hits.length >= maxPerHour) throw new HttpsError('resource-exhausted', '잠시 후 다시 시도해주세요.');
    hits.push(now);
    tx.set(ref, { hits });
  });
}
/* 신청자 쓰기 대행에서 비밀 항목을 state 대신 금고 문서로 바로 저장 */
async function stashSecrets(id, obj) {
  const sec = {}, priv = {};
  SECRET_KEYS.forEach((k) => { if (obj[k] != null) { sec[k] = obj[k]; delete obj[k]; } });
  PRIV_KEYS.forEach((k) => { if (obj[k] != null) { priv[k] = obj[k]; delete obj[k]; } });
  const at = new Date().toISOString();
  if (Object.keys(sec).length) {
    if (sec.pinAuth) sec.pinHash = admin.firestore.FieldValue.delete();
    await db.collection('secrets').doc(id).set(Object.assign({ at }, sec), { merge: true });
    if (sec.pinAuth) obj.pinSet = true;
  }
  if (Object.keys(priv).length) await db.collection('adminOnly').doc(id).set(Object.assign({ at }, priv), { merge: true });
}
function claimsOf(context) { return (context.auth && context.auth.token) || {}; }

exports.applicantAction = functions
  .region('asia-northeast3')
  .runWith({ timeoutSeconds: 30, memory: '256MB' })
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new HttpsError('unauthenticated', '연결 인증이 안 됐어요. 새로고침 후 다시 시도해주세요.');
    data = data || {};
    const op = String(data.op || '');
    const stateRef = db.doc('app/state');
    const uid = context.auth.uid;
    const pendingSelf = claimsOf(context).p === 1;

    if (op === 'submit') {
      await rateLimit(context, 'submit', 6);
      const kind = data.kind === 'mm' ? 'mm' : 'self';
      const src = data.entry || {};
      const id = String(src.id || '');
      if (!/^[A-Za-z0-9-]{8,64}$/.test(id)) throw new HttpsError('invalid-argument', '잘못된 요청이에요.');
      const entry = pickProfile(src, kind);
      entry.id = id;
      entry.pinAuth = cleanPinAuth(src.pinAuth);
      if (!entry.nickname || !entry.pinAuth || !entry.contactEnc || !entry.realNameEnc) throw new HttpsError('invalid-argument', '필수 항목이 빠졌어요.');
      if (kind === 'self' && (!entry.gender || !entry.birthYear)) throw new HttpsError('invalid-argument', '필수 항목이 빠졌어요. (만 19세 이상만 가입할 수 있어요)');
      if (kind === 'mm') entry.isMatchmaker = true;
      if (/^qa_/i.test(entry.nickname)) entry.testAccount = true;
      entry.submittedAt = new Date().toISOString();
      const photos = kind === 'self' ? cleanPhotos(data.photos) : null;
      {
        const s0 = (await stateRef.get()).data() || {};
        if ((s0.entries || []).concat(s0.pendingEntries || []).some((e) => e.id === id)) throw new HttpsError('already-exists', '이미 접수된 신청이에요.');
      }
      await stashSecrets(id, entry); /* PIN 해시·실명·번호는 금고로, state 에는 pinSet 표시만 */
      await db.runTransaction(async (tx) => {
        const s = (await tx.get(stateRef)).data() || {};
        if ((s.entries || []).concat(s.pendingEntries || []).some((e) => e.id === id)) throw new HttpsError('already-exists', '이미 접수된 신청이에요.');
        if (nickTaken(s, entry.nickname, id)) throw new HttpsError('already-exists', '이미 사용 중인 닉네임이에요. 다른 닉네임을 사용해주세요.');
        tx.update(stateRef, {
          pendingEntries: (s.pendingEntries || []).concat([entry]),
          logs: (s.logs || []).concat([logItem('signup', entry.nickname, kind === 'mm' ? '주선자 등록 신청' : '신청서 제출')])
        });
      });
      if (photos && photos.length) await db.collection('photos').doc(id).set({ photos }, { merge: true });
      const token = await admin.auth().createCustomToken(id, { p: 1 });
      return { ok: true, token };
    }

    if (op === 'guestMessage') {
      await rateLimit(context, 'msg', 10);
      const text = clip(data.text, 300).trim();
      const name = clip(data.name, 30).trim();
      if (!text || !name || !isSmallObj(data.phoneEnc)) throw new HttpsError('invalid-argument', '이름·전화번호·내용을 모두 입력해주세요.');
      const m = { id: nodeCrypto.randomUUID(), entryId: 'guest-' + nodeCrypto.randomUUID(), from: 'user', text, at: new Date().toISOString(), guestName: name, guestPhoneEnc: data.phoneEnc };
      await db.runTransaction(async (tx) => {
        const s = (await tx.get(stateRef)).data() || {};
        tx.update(stateRef, { messages: (s.messages || []).concat([m]), logs: (s.logs || []).concat([logItem('message', name + ' (비로그인)', '관리자에게 문의')]) });
      });
      return { ok: true };
    }

    if (op === 'pinReset') {
      await rateLimit(context, 'pinreset', 5);
      const nick = clip(data.nickname, 30).trim();
      if (!nick || !isSmallObj(data.phoneEnc)) throw new HttpsError('invalid-argument', '닉네임과 전화번호를 넣어주세요.');
      await db.runTransaction(async (tx) => {
        const s = (await tx.get(stateRef)).data() || {};
        const ent = (s.entries || []).concat(s.pendingEntries || []).find((e) => (e.nickname || '').trim() === nick);
        if (!ent) throw new HttpsError('not-found', '그 닉네임을 찾지 못했어요. 로그인 목록에 보이는 닉네임 그대로 넣어주세요.');
        if (ent.deactivated) throw new HttpsError('failed-precondition', '보관(휴면) 중인 계정이에요. 관리자에게 문의해주세요.');
        let list = (s.pinResetReqs || []).filter((q) => !(q.entryId === ent.id && q.status === 'pending'));
        list.push({ id: nodeCrypto.randomUUID(), entryId: ent.id, nickname: ent.nickname || nick, phoneEnc: data.phoneEnc, at: new Date().toISOString(), status: 'pending' });
        if (list.length > 50) list = list.slice(list.length - 50);
        tx.update(stateRef, { pinResetReqs: list, logs: (s.logs || []).concat([logItem('message', nick + ' (비로그인)', 'PIN 재설정 요청')]) });
      });
      return { ok: true };
    }

    /* ── 이하: 승인 대기 본인만 (토큰 p:1, uid = 내 신청서 id) ── */
    if (!pendingSelf) throw new HttpsError('permission-denied', '승인 대기 중인 본인만 할 수 있어요.');

    if (op === 'pendingView') {
      const s = (await stateRef.get()).data() || {};
      const me = (s.pendingEntries || []).find((e) => e.id === uid);
      if (!me) {
        /* 그사이 승인됨 → 회원 토큰으로 바꿔 쓰도록 알림 */
        const approved = (s.entries || []).some((e) => e.id === uid);
        return { entry: null, messages: [], approved };
      }
      const entry = Object.assign({}, me); delete entry.pinAuth; delete entry.pinHash;
      const messages = (s.messages || []).filter((m) => m.entryId === uid);
      return { entry, messages };
    }

    if (op === 'edit') {
      const src = data.entry || {};
      const photos = data.photos === undefined ? undefined : cleanPhotos(data.photos);
      const resubmitMsg = clip(data.resubmitMsg, 300).trim();
      await db.runTransaction(async (tx) => {
        const s = (await tx.get(stateRef)).data() || {};
        const me = (s.pendingEntries || []).find((e) => e.id === uid);
        if (!me) throw new HttpsError('not-found', '신청서를 찾을 수 없어요.');
        const patch = pickProfile(src, me.isMatchmaker ? 'mm' : 'self');
        const pa = cleanPinAuth(src.pinAuth);
        if (pa) patch.pinAuth = pa;
        await stashSecrets(uid, patch); /* 바뀐 PIN·실명·번호는 금고로 */
        if (patch.nickname && nickTaken(s, patch.nickname, uid)) throw new HttpsError('already-exists', '이미 사용 중인 닉네임이에요.');
        let nick = '';
        const pend = (s.pendingEntries || []).map((e) => {
          if (e.id !== uid) return e;
          const u = Object.assign({}, e, patch);
          if (patch.pinSet) delete u.pinHash;
          delete u.rejectedReason; delete u.rejectedAt; delete u.heldReason; delete u.heldAt;
          u.submittedAt = new Date().toISOString();
          nick = u.nickname || '';
          return u;
        });
        const upd = { pendingEntries: pend, logs: (s.logs || []).concat([logItem('edit', nick, (me.nickname !== nick ? '닉네임 변경: ' + me.nickname + ' → ' + nick : '신청서 수정'))]) };
        if (resubmitMsg) upd.messages = (s.messages || []).concat([{ id: nodeCrypto.randomUUID(), entryId: uid, from: 'user', text: '[재신청] ' + resubmitMsg, at: new Date().toISOString() }]);
        tx.update(stateRef, upd);
      });
      if (photos !== undefined) {
        await db.collection('photos').doc(uid).set({ photos: photos || [] }, { merge: true });
      }
      return { ok: true };
    }

    if (op === 'withdraw') {
      await db.runTransaction(async (tx) => {
        const s = (await tx.get(stateRef)).data() || {};
        const me = (s.pendingEntries || []).find((e) => e.id === uid);
        if (!me) throw new HttpsError('not-found', '취소할 신청서를 찾을 수 없어요.');
        tx.update(stateRef, {
          pendingEntries: (s.pendingEntries || []).filter((e) => e.id !== uid),
          logs: (s.logs || []).concat([logItem('withdraw', me.nickname || '신청자', '신청 취소(본인 철회)')])
        });
      });
      await db.collection('photos').doc(uid).delete().catch(() => {});
      await db.collection('pushTokens').doc(uid).delete().catch(() => {});
      return { ok: true };
    }

    if (op === 'message') {
      const text = clip(data.text, 300).trim();
      if (!text) throw new HttpsError('invalid-argument', '내용을 입력해주세요.');
      await db.runTransaction(async (tx) => {
        const s = (await tx.get(stateRef)).data() || {};
        const me = (s.pendingEntries || []).find((e) => e.id === uid);
        if (!me) throw new HttpsError('not-found', '신청서를 찾을 수 없어요.');
        tx.update(stateRef, {
          messages: (s.messages || []).concat([{ id: nodeCrypto.randomUUID(), entryId: uid, from: 'user', text, at: new Date().toISOString() }]),
          logs: (s.logs || []).concat([logItem('message', me.nickname || '신청자', '관리자에게 메시지')])
        });
      });
      return { ok: true };
    }

    if (op === 'hideMessages') {
      const one = data.id ? String(data.id) : '';
      await db.runTransaction(async (tx) => {
        const s = (await tx.get(stateRef)).data() || {};
        const msgs = (s.messages || []).map((m) => (m.entryId === uid && !m.hiddenByUser && (!one || m.id === one)) ? Object.assign({}, m, { hiddenByUser: true }) : m);
        tx.update(stateRef, { messages: msgs });
      });
      return { ok: true };
    }

    throw new HttpsError('invalid-argument', '알 수 없는 요청이에요.');
  });

/* ══ 3단계-①: 비밀 분리 ══
   app/state(회원이면 누구나 읽음)에 들어온 비밀을 회원별 문서로 옮기고 state 에서는 지움.
   - secrets/{id}   (서버 전용, 규칙상 아무도 못 읽음): PIN 해시(pinAuth/pinHash/pinEnc), PIN으로 잠근 번호(contactSelfEnc)
   - adminOnly/{id} (관리자만): 관리자 키로 암호화한 실명·번호·알게 된 경로
   - adminKey/main  (관리자만): 관리자 비밀번호로 감싼 개인키 (공개키는 모두가 암호화에 쓰므로 state 에 남김)
   앱은 예전처럼 state 에 값을 써도 되고(여기서 곧바로 옮겨짐), PIN이 있다는 표시는 entry.pinSet.
   계정 전환으로 PIN·개인정보를 다른 계정에서 물려받을 땐 entry.pinFrom / entry.privFrom 에 원래 계정 id. */
const SECRET_KEYS = ['pinAuth', 'pinHash', 'pinEnc', 'contactSelfEnc'];
const PRIV_KEYS = ['realNameEnc', 'contactEnc', 'referrerEnc'];
const SECRET_PURGE_MS = 7 * 86400000; /* state 에서 사라진 계정의 금고는 7일 뒤 삭제 (실수로 지워졌다 복구될 때 대비) */
function allOf(s) { return ((s && s.entries) || []).concat((s && s.pendingEntries) || []); }
function stableJson(v) {
  if (v === undefined) return 'undefined';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stableJson).join(',') + ']';
  return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stableJson(v[k])).join(',') + '}';
}
function hasPinInline(e) { return !!(e && (e.pinAuth || e.pinHash)); }
async function sweepSecrets(before, after) {
  const FV = admin.firestore.FieldValue;
  const beforeMap = {}; allOf(before).forEach((e) => { beforeMap[e.id] = e; });
  const afterIds = {}; allOf(after).forEach((e) => { afterIds[e.id] = 1; });
  const work = [];
  allOf(after).forEach((e) => {
    const sec = {}, priv = {};
    SECRET_KEYS.forEach((k) => { if (e[k] != null) sec[k] = e[k]; });
    PRIV_KEYS.forEach((k) => { if (e[k] != null) priv[k] = e[k]; });
    const prev = beforeMap[e.id];
    /* PIN 회수: 전엔 PIN이 있었는데 지금은 표시·값·물려받기 모두 없음 → 금고의 PIN도 지움 */
    const revoke = !!(prev && (prev.pinSet || hasPinInline(prev)) && !e.pinSet && !hasPinInline(e) && !e.pinFrom);
    if (Object.keys(sec).length || Object.keys(priv).length || e.pinFrom || e.privFrom || revoke) work.push({ e, sec, priv, revoke });
  });
  const removed = Object.keys(beforeMap).filter((id) => !afterIds[id]);
  const keyInline = (after.adminAuth && after.adminAuth.wrappedPrivateKey) ? after.adminAuth : null;
  if (!work.length && !removed.length && !keyInline) return;

  /* 1) 금고에 쓰기 — 물려받기(pinFrom/privFrom)를 반드시 먼저: 원래 계정의 PIN 회수가 먼저 돌면 복사할 PIN이 사라짐 */
  work.sort((a, b) => ((b.e.pinFrom || b.e.privFrom) ? 1 : 0) - ((a.e.pinFrom || a.e.privFrom) ? 1 : 0));
  const done = [];
  for (const w of work) {
    const id = w.e.id;
    const sec = Object.assign({}, w.sec), priv = Object.assign({}, w.priv);
    if (w.e.pinFrom && !hasPinInline(sec)) {
      const src = await pinRecord(w.e.pinFrom, after);
      if (src.pinAuth) sec.pinAuth = src.pinAuth; else if (src.pinHash) sec.pinHash = src.pinHash;
    }
    if (w.e.privFrom) {
      const fromInline = allOf(after).find((x) => x.id === w.e.privFrom) || {};
      const fromDoc = (await db.collection('adminOnly').doc(w.e.privFrom).get()).data() || {};
      PRIV_KEYS.forEach((k) => { if (priv[k] == null) { const v = fromInline[k] != null ? fromInline[k] : fromDoc[k]; if (v != null) priv[k] = v; } });
    }
    if (Object.keys(sec).length) {
      const put = Object.assign({ deletedAt: FV.delete(), at: new Date().toISOString() }, sec);
      if (sec.pinAuth && !sec.pinHash) put.pinHash = FV.delete(); /* 새 방식 PIN이 들어오면 옛 해시 제거 */
      await db.collection('secrets').doc(id).set(put, { merge: true });
    } else if (w.revoke) {
      await db.collection('secrets').doc(id).set({ pinAuth: FV.delete(), pinHash: FV.delete(), pinEnc: FV.delete() }, { merge: true }).catch(() => {});
    }
    if (Object.keys(priv).length) {
      await db.collection('adminOnly').doc(id).set(Object.assign({ deletedAt: FV.delete(), at: new Date().toISOString() }, priv), { merge: true });
    }
    done.push({ id, sec: w.sec, priv: w.priv, pinNow: hasPinInline(sec), hadPinFrom: !!w.e.pinFrom, hadPrivFrom: !!w.e.privFrom });
  }
  if (keyInline) {
    await db.collection('adminKey').doc('main').set({ salt: keyInline.salt, iv: keyInline.iv, wrappedPrivateKey: keyInline.wrappedPrivateKey, publicKeyJwk: keyInline.publicKeyJwk || null, at: new Date().toISOString() });
  }

  /* 2) state 에서 지우기 — 옮긴 값과 똑같을 때만 (그사이 새 값이 들어왔으면 다음 차례에 다시 옮김) */
  const doneMap = {}; done.forEach((d) => { doneMap[d.id] = d; });
  /* 값 비교는 키 순서 무관하게 (트리거로 받은 값과 트랜잭션에서 읽은 값은 맵 키 순서가 다를 수 있음) */
  const same = (a, b) => stableJson(a) === stableJson(b);
  const ref = db.doc('app/state');
  await db.runTransaction(async (tx) => {
    const s = (await tx.get(ref)).data() || {};
    let changed = false;
    const strip = (list) => (list || []).map((e) => {
      const d = doneMap[e.id];
      if (!d) return e;
      const u = Object.assign({}, e);
      let touched = false;
      Object.keys(d.sec).forEach((k) => { if (same(u[k], d.sec[k])) { delete u[k]; touched = true; } });
      Object.keys(d.priv).forEach((k) => { if (same(u[k], d.priv[k])) { delete u[k]; touched = true; } });
      if (d.pinNow && !u.pinSet && !hasPinInline(u)) { u.pinSet = true; touched = true; }
      if (d.hadPinFrom && u.pinFrom) { delete u.pinFrom; touched = true; }
      if (d.hadPrivFrom && u.privFrom) { delete u.privFrom; touched = true; }
      if (touched) changed = true;
      return touched ? u : e;
    });
    const upd = { entries: strip(s.entries), pendingEntries: strip(s.pendingEntries) };
    if (keyInline && s.adminAuth && same(s.adminAuth.wrappedPrivateKey, keyInline.wrappedPrivateKey)) {
      upd.adminAuth = { publicKeyJwk: s.adminAuth.publicKeyJwk || null };
      changed = true;
    }
    if (changed) tx.update(ref, upd);
  });

  /* 3) 사라진 계정: 금고에 삭제 표시만 (7일 뒤 remindPending 이 정리) */
  for (const id of removed) {
    const at = new Date().toISOString();
    await db.collection('secrets').doc(id).set({ deletedAt: at }, { merge: true }).catch(() => {});
    await db.collection('adminOnly').doc(id).set({ deletedAt: at }, { merge: true }).catch(() => {});
  }
}
/* 삭제 표시 후 7일 지난 금고 문서 정리 (그사이 계정이 되살아났으면 표시만 지움) */
async function purgeDeletedSecrets() {
  const st = (await db.doc('app/state').get()).data() || {};
  const alive = {}; allOf(st).forEach((e) => { alive[e.id] = 1; });
  for (const col of ['secrets', 'adminOnly']) {
    const qs = await db.collection(col).where('deletedAt', '!=', null).get().catch(() => null);
    if (!qs) continue;
    for (const d of qs.docs) {
      const t = new Date(d.data().deletedAt).getTime();
      if (alive[d.id]) await d.ref.set({ deletedAt: admin.firestore.FieldValue.delete() }, { merge: true });
      else if (t && Date.now() - t > SECRET_PURGE_MS) await d.ref.delete();
    }
  }
}

/* ══ 3단계-②: 대화방 (chats/{pair}) ══
   두 사람당 문서 1개. 읽기는 viewers(두 사람 + 각자의 주선자) — 관리자는 신고된 방만(규칙에서 강제).
   쓰기는 서버만: 보내기·지우기·신고는 chatAction. 예전 state.dm 은 onStateChange 가 대화방으로 옮김.
   지우기 = 내 화면에서만(clearedAt[내 id]), 두 사람 모두 지운 뒤 새 메시지가 없으면 문서 삭제.
   탈퇴·삭제된 회원이 있어도 방은 그대로(상대 쪽 기록 유지). */
const CHAT_MAX_MSGS = 2000;
/* 두 사람이 모두 지웠거나 둘 다 탈퇴한 대화방도 신고·분쟁 대응을 위해 서버에 90일 보관 후 삭제 (신고 중이면 보존) */
const CHAT_RETAIN_MS = 90 * 86400000;
function pairOf(a, b) { return [a, b].sort().join('__'); }
function chatViewers(entries, members) {
  const v = {};
  members.forEach((id) => {
    v[id] = 1;
    const e = (entries || []).find((x) => x.id === id);
    if (e && e.managedBy) v[e.managedBy] = 1;
  });
  return Object.keys(v);
}
function chatApproved(state, a, b) {
  return (state.dateRequests || []).some((r) => (r.type || 'contact') === 'contact' && r.approved &&
    ((r.fromId === a && r.toId === b) || (r.fromId === b && r.toId === a)));
}
/* 호출자(토큰 uid)가 이 프로필로 행동할 수 있는지: 본인이거나 그 프로필의 주선자 */
function actsAs(context, entry) {
  const uid = context.auth && context.auth.uid;
  return !!(entry && uid && (uid === entry.id || (entry.managedBy && uid === entry.managedBy)));
}
/* 예전 state.dm(한 배열)을 대화방 문서로 이동. 옮긴 메시지는 state.dm 에서 제거 */
async function migrateDmToChats(after) {
  const dm = after.dm || [];
  if (!dm.length) return;
  const entries = after.entries || [];
  const byPair = {};
  dm.forEach((m) => { const p = m.pair || pairOf(m.fromId, m.toId); (byPair[p] = byPair[p] || []).push(m); });
  const moved = {};
  for (const p of Object.keys(byPair)) {
    const ref = db.collection('chats').doc(p);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const cur = snap.exists ? snap.data() : null;
      const have = {}; ((cur && cur.msgs) || []).forEach((m) => { have[m.id] = 1; });
      const add = byPair[p].filter((m) => !have[m.id]).map((m) => {
        const o = { id: m.id, fromId: m.fromId, toId: m.toId, text: String(m.text || ''), at: m.at || new Date().toISOString() };
        if (m.viaMm) o.viaMm = true;
        return o;
      });
      const members = p.split('__');
      const msgs = ((cur && cur.msgs) || []).concat(add).sort((x, y) => String(x.at).localeCompare(String(y.at))).slice(-CHAT_MAX_MSGS);
      const last = msgs[msgs.length - 1] || {};
      tx.set(ref, Object.assign({}, cur || { pair: p, members, createdAt: new Date().toISOString(), clearedAt: {} }, {
        viewers: chatViewers(entries, members), msgs, lastAt: last.at || null, lastFrom: last.fromId || null, updatedAt: new Date().toISOString()
      }));
    });
    byPair[p].forEach((m) => { moved[m.id] = 1; });
  }
  const ref = db.doc('app/state');
  await db.runTransaction(async (tx) => {
    const s = (await tx.get(ref)).data() || {};
    const left = (s.dm || []).filter((m) => !moved[m.id]);
    if (left.length !== (s.dm || []).length) tx.update(ref, { dm: left });
  });
  console.log('migrateDmToChats: moved ' + Object.keys(moved).length + ' msgs into ' + Object.keys(byPair).length + ' rooms'); /* 건수만 (내용 X) */
}
/* 주선자가 바뀐 회원이 있으면 그 회원의 대화방 viewers 갱신 */
async function refreshChatViewers(before, after) {
  const prev = {}; (before.entries || []).forEach((e) => { prev[e.id] = e.managedBy || ''; });
  const changed = (after.entries || []).filter((e) => prev[e.id] !== undefined && prev[e.id] !== (e.managedBy || '')).map((e) => e.id);
  for (const id of changed) {
    const qs = await db.collection('chats').where('members', 'array-contains', id).get();
    for (const d of qs.docs) {
      await d.ref.set({ viewers: chatViewers(after.entries || [], d.data().members || []) }, { merge: true });
    }
  }
}

exports.chatAction = functions
  .region('asia-northeast3')
  .runWith({ timeoutSeconds: 20, memory: '256MB' })
  .https.onCall(async (data, context) => {
    data = data || {};
    const c = claimsOf(context);
    const op = String(data.op || '');
    const state = (await db.doc('app/state').get()).data() || {};
    const entries = state.entries || [];

    /* ── 관리자: 신고된 방 열람 기록 · 신고 처리 완료 ── */
    if (op === 'adminViewed' || op === 'resolve') {
      if (c.admin !== 1) throw new HttpsError('permission-denied', '관리자만 할 수 있어요.');
      const pair = String(data.pair || '');
      const ref = db.collection('chats').doc(pair);
      const snap = await ref.get();
      if (!snap.exists || !snap.data().reportedAt) throw new HttpsError('failed-precondition', '신고된 대화방이 아니에요.');
      const names = (snap.data().members || []).map((id) => nameOf(entries, id)).join(' ↔ ');
      if (op === 'resolve') {
        const d = snap.data();
        const hist = (d.reportHistory || []).concat([{ at: d.reportedAt, by: d.reportedBy || '', reason: d.reportReason || '', resolvedAt: new Date().toISOString() }]).slice(-20);
        await ref.set({ reportHistory: hist, reportedAt: admin.firestore.FieldValue.delete(), reportedBy: admin.firestore.FieldValue.delete(), reportReason: admin.firestore.FieldValue.delete() }, { merge: true });
      }
      await db.runTransaction(async (tx) => {
        const s = (await tx.get(db.doc('app/state'))).data() || {};
        tx.update(db.doc('app/state'), { logs: (s.logs || []).concat([logItem('admin', '관리자', (op === 'resolve' ? '신고 대화 처리 완료: ' : '신고 대화 열람: ') + names)]) });
      });
      return { ok: true };
    }

    if (c.m !== 1) throw new HttpsError('permission-denied', '승인된 회원만 대화할 수 있어요.');
    const asId = String(data.as || '');
    const otherId = String(data.other || '');
    const asE = entries.find((e) => e.id === asId);
    if (!asE || !actsAs(context, asE)) throw new HttpsError('permission-denied', '이 프로필로 대화할 수 없어요.');
    if (!otherId || otherId === asId) throw new HttpsError('invalid-argument', '대화 상대를 확인해주세요.');
    const pair = pairOf(asId, otherId);
    const ref = db.collection('chats').doc(pair);

    if (op === 'send') {
      const text = String(data.text || '').trim().slice(0, 500);
      if (!text) throw new HttpsError('invalid-argument', '메시지를 입력해주세요.');
      const otherE = entries.find((e) => e.id === otherId);
      if (!otherE) throw new HttpsError('failed-precondition', '탈퇴한 회원에게는 보낼 수 없어요.');
      if (otherE.deactivated) throw new HttpsError('failed-precondition', '상대가 지금 휴면(보관) 중이라 메시지를 보낼 수 없어요.');
      if (asE.deactivated) throw new HttpsError('failed-precondition', '보관(휴면) 중인 계정이에요.');
      if (!chatApproved(state, asId, otherId)) throw new HttpsError('failed-precondition', '대화 신청이 수락된 사이에서만 대화할 수 있어요.');
      const m = { id: nodeCrypto.randomUUID(), fromId: asId, toId: otherId, text, at: new Date().toISOString() };
      if (asE.managedBy && context.auth.uid === asE.managedBy && !asE.ownerSelf) m.viaMm = true; /* 주선자가 친구 대신 보냄 */
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const cur = snap.exists ? snap.data() : { pair, members: [asId, otherId].sort(), createdAt: m.at, clearedAt: {} };
        const msgs = (cur.msgs || []).concat([m]).slice(-CHAT_MAX_MSGS);
        const next = Object.assign({}, cur, { viewers: chatViewers(entries, cur.members || [asId, otherId]), msgs, lastAt: m.at, lastFrom: asId, updatedAt: m.at });
        delete next.bothClearedAt;
        tx.set(ref, next);
      });
      await notifyRecipient(entries, otherId, '💬 ' + nameOf(entries, asId) + '님의 채팅', text.slice(0, 40), { route: 'dm', focusId: asId }).catch(() => {});
      return { ok: true, msg: m };
    }

    if (op === 'clear') {
      let deleted = false;
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return;
        const d = snap.data();
        const now = new Date().toISOString();
        const cleared = Object.assign({}, d.clearedAt || {}, { [asId]: now });
        const members = d.members || [];
        /* 두 사람 모두 지워도 바로 삭제하지 않음 — 보관 시작 시각만 기록, 90일 뒤 purgeOldChats 가 삭제 */
        const allCleared = members.every((id) => cleared[id] && (!d.lastAt || cleared[id] >= d.lastAt));
        const upd = { clearedAt: cleared };
        if (allCleared && !d.bothClearedAt) upd.bothClearedAt = now;
        tx.update(ref, upd);
      });
      return { ok: true, deleted }; /* deleted 는 이제 항상 false (보관 후 자동 삭제) */
    }

    if (op === 'report') {
      const reason = String(data.reason || '').trim().slice(0, 300);
      if (!reason) throw new HttpsError('invalid-argument', '신고 사유를 적어주세요.');
      const snap = await ref.get();
      if (!snap.exists) throw new HttpsError('not-found', '대화 내용이 없어요.');
      await ref.set({ reportedAt: new Date().toISOString(), reportedBy: asId, reportReason: reason }, { merge: true });
      await db.runTransaction(async (tx) => {
        const s = (await tx.get(db.doc('app/state'))).data() || {};
        tx.update(db.doc('app/state'), { logs: (s.logs || []).concat([logItem('report', nameOf(entries, asId), '대화 신고 → ' + nameOf(entries, otherId))]) });
      });
      await sendToAdmin('🚨 대화 신고', nameOf(entries, asId) + '님이 ' + nameOf(entries, otherId) + '님과의 대화를 신고했어요').catch(() => {});
      return { ok: true };
    }

    throw new HttpsError('invalid-argument', '알 수 없는 요청이에요.');
  });

/* 보관 기간이 지난 대화방 삭제: (두 사람 모두 지움 또는 두 사람 모두 탈퇴) 후 90일, 신고 중이면 보존 */
async function purgeOldChats(nowMs) {
  const now = nowMs || Date.now();
  const st = (await db.doc('app/state').get()).data() || {};
  const alive = {}; allOf(st).forEach((e) => { alive[e.id] = 1; });
  const qs = await db.collection('chats').get();
  let removed = 0;
  for (const d of qs.docs) {
    const r = d.data();
    if (r.reportedAt) continue;
    const goneAll = (r.members || []).every((id) => !alive[id]);
    const since = r.bothClearedAt || (goneAll ? (r.lastAt || r.updatedAt) : null);
    if (since && now - new Date(since).getTime() > CHAT_RETAIN_MS) { await d.ref.delete(); removed++; }
  }
  if (removed) console.log('purgeOldChats: removed ' + removed + ' rooms');
  return removed;
}
if (process.env.BRIDGE_LOCAL_TEST) exports._purgeOldChatsForTest = purgeOldChats; /* 로컬 시험 전용 (배포 시 내보내지 않음) */

/* ══ 3단계-③: 사진 원본 열람 권한 ══
   photos/{id} 에 서버가 viewers(볼 수 있는 uid)·owners(고칠 수 있는 uid)를 유지 → 규칙이 이 목록으로 판단.
   앱의 canViewPhotoOf 와 같은 기준: 승인된 사진 요청은 서로 공개, '내 사진 공개'(fromRevealed)는 요청 받은 사람에게 공개.
   본인·주선자(대리 프로필)는 항상 포함, 보는 사람이 대리 프로필이면 그 주선자도 포함(주선자가 친구로 전환해 봄). 관리자는 규칙에서 허용.
   매 변경마다 전체를 다시 계산하되, 서버 전용 캐시(acl/photos)와 비교해 바뀐 문서만 씀. 하루 한 번은 전부 다시 씀. */
function photoAclFor(state) {
  const entries = (state.entries || []).concat(state.pendingEntries || []);
  const byId = {}; entries.forEach((e) => { byId[e.id] = e; });
  const acl = {};
  const slot = (id) => (acl[id] = acl[id] || { viewers: {}, owners: {} });
  entries.forEach((e) => {
    const a = slot(e.id);
    a.owners[e.id] = 1; a.viewers[e.id] = 1;
    if (e.managedBy) { a.owners[e.managedBy] = 1; a.viewers[e.managedBy] = 1; }
  });
  const grant = (targetId, viewerId) => {
    if (!byId[targetId] || !viewerId) return;
    const a = slot(targetId);
    a.viewers[viewerId] = 1;
    const v = byId[viewerId];
    if (v && v.managedBy) a.viewers[v.managedBy] = 1;
  };
  (state.dateRequests || []).forEach((r) => {
    if ((r.type || 'contact') !== 'photo') return;
    if (r.approved) { grant(r.toId, r.fromId); grant(r.fromId, r.toId); }
    if (r.fromRevealed) grant(r.fromId, r.toId);
  });
  const out = {};
  Object.keys(acl).forEach((id) => { out[id] = { viewers: Object.keys(acl[id].viewers).sort(), owners: Object.keys(acl[id].owners).sort() }; });
  return out;
}
async function syncPhotoAcl(state, force) {
  const acl = photoAclFor(state);
  const cacheRef = db.doc('acl/photos');
  const prev = force ? {} : (((await cacheRef.get()).data() || {}).map || {});
  const changed = Object.keys(acl).filter((id) => stableJson(acl[id]) !== stableJson(prev[id]));
  if (!changed.length) return 0;
  for (let i = 0; i < changed.length; i += 400) {
    const batch = db.batch();
    changed.slice(i, i + 400).forEach((id) => batch.set(db.collection('photos').doc(id), acl[id], { merge: true }));
    await batch.commit();
  }
  await cacheRef.set({ map: acl, at: new Date().toISOString() });
  return changed.length;
}
