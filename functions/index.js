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

/* 회원 전화번호를 안전 저장 (가입/수정 시 클라이언트가 호출). PIN 검증으로 본인만 저장 가능. */
exports.savePhone = functions
  .region('asia-northeast3')
  .runWith({ secrets: ['NUM_ENC_KEY'], timeoutSeconds: 20, memory: '256MB' })
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', '로그인이 필요해요.');
    const entryId = String((data && data.entryId) || '');
    const pin = String((data && data.pin) || '');
    const phone = normPhone(data && data.phone);
    if (!entryId || !pin) throw new functions.https.HttpsError('invalid-argument', '정보가 부족해요.');
    if (!phone) throw new functions.https.HttpsError('invalid-argument', '전화번호 형식이 올바르지 않아요.');
    const snap = await db.doc('app/state').get();
    const state = snap.data() || {};
    const entry = (state.entries || []).concat(state.pendingEntries || []).find((e) => e.id === entryId);
    if (!entry) throw new functions.https.HttpsError('not-found', '계정을 찾을 수 없어요.');
    if (!verifyPinServer(pin, authEntryFor(state, entry))) {
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
    if (!entryId || !pin) throw new functions.https.HttpsError('invalid-argument', '정보가 부족해요.');
    const snap = await db.doc('app/state').get();
    const state = snap.data() || {};
    const entry = (state.entries || []).find((e) => e.id === entryId);
    if (!entry) throw new functions.https.HttpsError('not-found', '계정을 찾을 수 없어요.');
    if (!verifyPinServer(pin, authEntryFor(state, entry))) {
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
    if (!entryId || !pin) throw new functions.https.HttpsError('invalid-argument', '정보가 부족해요.');
    const snap = await db.doc('app/state').get();
    const state = snap.data() || {};
    const entry = (state.entries || []).find((e) => e.id === entryId);
    if (!entry) throw new functions.https.HttpsError('not-found', '계정을 찾을 수 없어요.');
    if (!verifyPinServer(pin, authEntryFor(state, entry))) {
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
    if (!entryId || !pin) throw new functions.https.HttpsError('invalid-argument', '정보가 부족해요.');
    const snap = await db.doc('app/state').get();
    const state = snap.data() || {};
    const entry = (state.entries || []).find((e) => e.id === entryId);
    if (!entry) throw new functions.https.HttpsError('not-found', '계정을 찾을 수 없어요.');
    if (!verifyPinServer(pin, authEntryFor(state, entry))) {
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
async function sendToTokens(tokens, title, body, cleanupIds) {
  if (!tokens.length) return;
  try {
    /* data-only: 서비스워커가 직접 알림을 만들어 중복 표시를 막음 */
    const res = await admin.messaging().sendEachForMulticast({
      tokens: tokens,
      data: { title: title, body: body, url: SITE_URL },
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
async function sendTo(id, title, body) {
  const tokens = await tokensFor(id);
  await sendToTokens(tokens, title, body, [id]);
}
function entryById(entries, id) {
  return (entries || []).find((x) => x.id === id) || null;
}
/* 수신자에게 알림. 대리 등록(주선자 관리) 프로필이면 주선자에게 대신 보냄. */
async function notifyRecipient(entries, id, title, body) {
  const e = entryById(entries, id);
  if (e && e.managedBy) {
    /* 대리(주선자 관리) 친구: 주선자에게 항상 전달(소개 대상 본인은 앱에 없을 수 있음).
       + 친구가 유효한 임시 PIN으로 직접 쓰는 상태면 친구 본인에게도 (토큰 없으면 자동 무시) */
    const jobs = [sendTo(e.managedBy, title, '[소개: ' + (e.nickname || '') + '] ' + body)];
    if (subPinActive(e)) jobs.push(sendTo(id, title, body));
    await Promise.all(jobs);
  } else {
    /* 독립(자기 등록) 계정 → 본인에게 */
    await sendTo(id, title, body);
  }
}
/* 관리자에게: pushTokens/admin 에 등록된 기기들 (관리자 페이지의 알림 토글로 기기별 관리) */
async function sendToAdmin(title, body) {
  const tokens = await tokensFor('admin');
  await sendToTokens(tokens, title, body, ['admin']);
}

exports.onStateChange = functions
  .region('asia-northeast3')
  .runWith({ maxInstances: 10, timeoutSeconds: 30, memory: '256MB' })
  .firestore.document('app/state')
  .onUpdate(async (change) => {
    const before = change.before.data() || {};
    const after = change.after.data() || {};
    const entries = after.entries || [];
    const beforeMap = {};
    (before.dateRequests || []).forEach((r) => { beforeMap[r.id] = r; });

    const jobs = [];
    (after.dateRequests || []).forEach((r) => {
      const prev = beforeMap[r.id];
      const type = (r.type || 'contact') === 'photo' ? '사진' : '데이트';
      if (!prev) {
        /* 새 요청 → 받는 사람에게 (대리 프로필이면 주선자에게) */
        jobs.push(notifyRecipient(entries, r.toId, '새 ' + type + ' 요청', nameOf(entries, r.fromId) + '님이 ' + type + ' 요청을 보냈어요'));
      } else {
        /* 요청자가 자기 사진을 공개함 → 받는 사람에게 */
        if (!prev.fromRevealed && r.fromRevealed) {
          jobs.push(notifyRecipient(entries, r.toId, '📷 사진 공개', nameOf(entries, r.fromId) + '님이 자기 사진을 공개했어요'));
        }
        const ps = reqStatus(prev), ns = reqStatus(r);
        if (ps === ns) return;
        /* approved 와 user_approved(당사자 승인·관리자 확정 대기) 를 하나의 "승인" 이벤트로 취급해 중복 알림 방지 */
        const wasApproved = (ps === 'approved' || ps === 'user_approved');
        const isApproved = (ns === 'approved' || ns === 'user_approved');
        if (isApproved && !wasApproved) jobs.push(notifyRecipient(entries, r.fromId, type + ' 요청 승인 🎉', nameOf(entries, r.toId) + '님이 요청을 승인했어요'));
        else if (ns === 'held' && ps !== 'held') jobs.push(notifyRecipient(entries, r.fromId, type + ' 요청 보류', nameOf(entries, r.toId) + '님이 요청을 보류했어요'));
        else if (ns === 'rejected' && ps !== 'rejected') jobs.push(notifyRecipient(entries, r.fromId, type + ' 요청 거절', nameOf(entries, r.toId) + '님이 요청을 거절했어요'));
        else if (ns === 'pending' && (ps === 'held' || ps === 'rejected')) jobs.push(notifyRecipient(entries, r.toId, type + ' 재요청', nameOf(entries, r.fromId) + '님이 정보를 담아 다시 요청했어요'));
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
      if (!beforeJoin[j.id]) jobs.push(sendTo(j.toId, '🤝 새 주선자 요청', (j.fromNick || '누군가') + '님이 주선자로 관리해 달라고 요청했어요'));
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
      else if (m.from === 'admin') jobs.push(sendTo(m.entryId, '💬 관리자 메시지', preview));
    });

    /* 회원↔회원 데이트 채팅(dm): 새 메시지 → 받는 사람에게 (대리 프로필이면 주선자에게) */
    const beforeDm = {};
    (before.dm || []).forEach((m) => { beforeDm[m.id] = true; });
    (after.dm || []).forEach((m) => {
      if (beforeDm[m.id]) return;
      const preview = (m.text || '').slice(0, 40);
      jobs.push(notifyRecipient(entries, m.toId, '💬 ' + nameOf(entries, m.fromId) + '님의 채팅', preview));
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
        const t = r.submittedAt ? new Date(r.submittedAt).getTime() : 0;
        if (!t) return r;
        const age = now - t;
        const type = (r.type || 'contact') === 'photo' ? '사진' : '데이트';
        const fromNick = nameOf(entries, r.fromId);
        /* 7일+ 무응답: 앱 관리자 메시지 1회(메시지함에 남아 반드시 봄 · onStateChange가 푸시도 보냄). remind3Sent로 중복 방지 */
        if (age >= REMIND_3_MS && !r.remind3Sent) {
          newMsgs.push({ id: nodeCrypto.randomUUID(), entryId: r.toId, from: 'admin', text: '[베니브릿지] 확인 대기 중인 요청이 있어요. 앱에서 승인·보류·거절을 정해주세요 🙏', at: new Date().toISOString() });
          changed = true;
          return Object.assign({}, r, { remind1Sent: true, remind2Sent: true, remind3Sent: true });
        }
        if (age >= REMIND_2_MS && !r.remind2Sent) {
          sends.push({ toId: r.toId, title: '⏰ ' + type + ' 요청 알림', body: fromNick + '님의 ' + type + ' 요청이 3일째 기다리고 있어요. 승인/거절을 정해주세요' });
          changed = true;
          return Object.assign({}, r, { remind1Sent: true, remind2Sent: true });
        }
        if (age >= REMIND_1_MS && !r.remind1Sent) {
          sends.push({ toId: r.toId, title: '⏰ ' + type + ' 요청 알림', body: fromNick + '님의 ' + type + ' 요청이 아직 대기 중이에요. 확인해주세요' });
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
      await Promise.all(result.sends.map((s) => notifyRecipient(result.entries, s.toId, s.title, s.body)));
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
