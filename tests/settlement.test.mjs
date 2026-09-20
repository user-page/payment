/**
 * Test cho phần tính tiền. Chạy: node --test tests/
 *
 * Không cần trình duyệt, không cần database — vì domain/settlement.js
 * là code thuần tính toán.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  distributeShares,
  computeSummary,
  computeSettlement,
  aggregateUnpaidDebts,
  remainingOf,
  unpaidSponsors,
} from '../assets/js/domain/settlement.js';

// ---- tiện ích dựng dữ liệu mẫu ----

function makeEvent({ people, rounds = [], sponsors = [], organizerId }) {
  return {
    id: 'ev1',
    name: 'Buổi test',
    organizerId,
    people: people.map((p) => ({ isPaid: false, paidAmount: 0, ...p })),
    rounds: rounds.map((r) => ({ soTien: 0, thamGiaIds: [], nguoiTraId: null, ...r })),
    sponsors: sponsors.map((s) => ({ soTien: 0, stillSplit: true, isPaid: false, personId: null, ...s })),
  };
}

const BA_NGUOI = [
  { id: 'a', name: 'ThangLV11' },
  { id: 'b', name: 'HungNN14' },
  { id: 'c', name: 'PhongTH4' },
];

// ---- distributeShares ----

test('chia đều: mọi người trả đúng bằng nhau, phần lẻ bỏ qua', () => {
  const shares = distributeShares(800, ['a', 'b', 'c']);
  assert.deepEqual(shares, { a: 266, b: 266, c: 266 });

  const tong = Object.values(shares).reduce((s, v) => s + v, 0);
  assert.equal(tong, 798, 'thừa 2 nghìn không thu của ai');
});

test('chia đều: chia hết thì không thừa', () => {
  assert.deepEqual(distributeShares(900, ['a', 'b', 'c']), { a: 300, b: 300, c: 300 });
});

test('chia đều: không có ai thì trả về rỗng, không chia cho 0', () => {
  assert.deepEqual(distributeShares(500, []), {});
});

// ---- computeSummary: trường hợp cơ bản ----

test('một khoản chi, một người trả, ba người tham gia', () => {
  const ev = makeEvent({
    organizerId: 'a',
    people: BA_NGUOI,
    rounds: [{ id: 'r1', soTien: 900, nguoiTraId: 'a', thamGiaIds: ['a', 'b', 'c'] }],
  });

  const s = computeSummary(ev);
  assert.deepEqual(s.daTra, { a: 900, b: 0, c: 0 });
  assert.deepEqual(s.phaiTra, { a: 300, b: 300, c: 300 });
  assert.deepEqual(s.chenhLech, { a: 600, b: -300, c: -300 });

  const st = computeSettlement(ev, s);
  assert.deepEqual(st, [
    { fromId: 'b', toId: 'a', amount: 300 },
    { fromId: 'c', toId: 'a', amount: 300 },
  ]);
});

test('người không tham gia khoản nào thì không phải trả khoản đó', () => {
  const ev = makeEvent({
    organizerId: 'a',
    people: BA_NGUOI,
    rounds: [
      { id: 'r1', soTien: 900, nguoiTraId: 'a', thamGiaIds: ['a', 'b', 'c'] },
      { id: 'r2', soTien: 200, nguoiTraId: 'a', thamGiaIds: ['a', 'b'] }, // c về sớm
    ],
  });

  const s = computeSummary(ev);
  assert.equal(s.phaiTra.c, 300, 'c chỉ chịu khoản đầu');
  assert.equal(s.phaiTra.b, 400, 'b chịu cả hai khoản');
});

// ---- tài trợ ----

test('tài trợ trừ đều vào phần mọi người phải trả', () => {
  const ev = makeEvent({
    organizerId: 'a',
    people: BA_NGUOI,
    rounds: [{ id: 'r1', soTien: 900, nguoiTraId: 'a', thamGiaIds: ['a', 'b', 'c'] }],
    sponsors: [{ id: 's1', ten: 'Sếp', soTien: 300, isPaid: true }],
  });

  const s = computeSummary(ev);
  assert.deepEqual(s.phaiTra, { a: 200, b: 200, c: 200 }, 'mỗi người được giảm 100');
});

test('người tài trợ cũng tham gia, bỏ tích chia phần -> miễn hẳn phần nhậu', () => {
  const ev = makeEvent({
    organizerId: 'a',
    people: BA_NGUOI,
    rounds: [{ id: 'r1', soTien: 900, nguoiTraId: 'a', thamGiaIds: ['a', 'b', 'c'] }],
    sponsors: [{ id: 's1', ten: 'HungNN14', soTien: 300, personId: 'b', stillSplit: false, isPaid: true }],
  });

  const s = computeSummary(ev);
  assert.equal(s.phaiTra.b, 0, 'b được miễn vì đã bao');
  assert.equal(s.phaiTra.c, 200, 'người khác vẫn được giảm đều');
});

test('ĐÚNG VÍ DỤ CỦA NGƯỜI DÙNG: tài trợ 800 chưa đưa tiền, bỏ tích chia phần -> vẫn nợ 800', () => {
  const ev = makeEvent({
    organizerId: 'org',
    people: [
      { id: 'org', name: 'Organizer' },
      { id: 'x', name: 'X' },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C' },
    ],
    rounds: [{ id: 'r1', soTien: 3000, nguoiTraId: 'org', thamGiaIds: ['org', 'x', 'b', 'c'] }],
    sponsors: [{ id: 's1', ten: 'X', soTien: 800, personId: 'x', stillSplit: false, isPaid: false }],
  });

  const s = computeSummary(ev);
  assert.equal(s.phaiTra.x, 800, 'miễn phần nhậu nhưng vẫn nợ đúng khoản tài trợ đã hứa');

  const st = computeSettlement(ev, s);
  const cuaX = st.find((r) => r.fromId === 'x');
  assert.deepEqual(cuaX, { fromId: 'x', toId: 'org', amount: 800 });
});

test('tài trợ chưa đưa tiền nhưng VẪN tích chia phần -> nợ cả hai phần', () => {
  const ev = makeEvent({
    organizerId: 'org',
    people: [
      { id: 'org', name: 'Organizer' },
      { id: 'x', name: 'X' },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C' },
    ],
    rounds: [{ id: 'r1', soTien: 3000, nguoiTraId: 'org', thamGiaIds: ['org', 'x', 'b', 'c'] }],
    sponsors: [{ id: 's1', ten: 'X', soTien: 800, personId: 'x', stillSplit: true, isPaid: false }],
  });

  const s = computeSummary(ev);
  assert.equal(s.phaiTra.x, 550 + 800, 'phần nhậu 550 cộng khoản tài trợ 800');
});

test('tài trợ đã đưa tiền rồi thì không nợ gì thêm', () => {
  const ev = makeEvent({
    organizerId: 'org',
    people: [
      { id: 'org', name: 'Organizer' },
      { id: 'x', name: 'X' },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C' },
    ],
    rounds: [{ id: 'r1', soTien: 3000, nguoiTraId: 'org', thamGiaIds: ['org', 'x', 'b', 'c'] }],
    sponsors: [{ id: 's1', ten: 'X', soTien: 800, personId: 'x', stillSplit: false, isPaid: true }],
  });

  assert.equal(computeSummary(ev).phaiTra.x, 0);
});

// ---- trả góp ----

test('trả bớt một phần thì trừ đúng phần đã trả', () => {
  assert.equal(remainingOf(800, 300), 500);
  assert.equal(remainingOf(800, 0), 800);
  assert.equal(remainingOf(800, 800), 0);
  assert.equal(remainingOf(800, 900), 0, 'trả dư không thành số âm');
  assert.equal(remainingOf(800, null), 800, 'chưa nhập gì coi như chưa trả');
});

// ---- cộng dồn nợ nhiều buổi ----

test('cộng dồn nợ theo tên qua nhiều buổi, đã trừ phần trả góp', () => {
  const buoi1 = makeEvent({
    organizerId: 'a',
    people: [
      { id: 'a', name: 'ThangLV11' },
      { id: 'b', name: 'HungNN14' },
    ],
    rounds: [{ id: 'r1', soTien: 400, nguoiTraId: 'a', thamGiaIds: ['a', 'b'] }],
  });

  const buoi2 = makeEvent({
    organizerId: 'a2',
    people: [
      { id: 'a2', name: 'ThangLV11' },
      { id: 'b2', name: 'HungNN14', paidAmount: 50 }, // đã trả bớt 50
    ],
    rounds: [{ id: 'r2', soTien: 600, nguoiTraId: 'a2', thamGiaIds: ['a2', 'b2'] }],
  });

  const rows = aggregateUnpaidDebts([buoi1, buoi2]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'HungNN14');
  assert.equal(rows[0].total, 200 + (300 - 50));
  assert.equal(rows[0].count, 2);
});

test('trả đủ rồi thì không còn trong danh sách nợ', () => {
  const ev = makeEvent({
    organizerId: 'a',
    people: [
      { id: 'a', name: 'ThangLV11' },
      { id: 'b', name: 'HungNN14', paidAmount: 200 },
    ],
    rounds: [{ id: 'r1', soTien: 400, nguoiTraId: 'a', thamGiaIds: ['a', 'b'] }],
  });

  assert.deepEqual(aggregateUnpaidDebts([ev]), []);
});

test('buổi chưa chọn người chia tiền thì bỏ qua, không làm vỡ phép tính', () => {
  const ev = makeEvent({
    organizerId: null,
    people: BA_NGUOI,
    rounds: [{ id: 'r1', soTien: 900, thamGiaIds: ['a', 'b', 'c'] }],
  });

  assert.deepEqual(computeSettlement(ev, computeSummary(ev)), []);
  assert.deepEqual(aggregateUnpaidDebts([ev]), []);
});

// ---- cảnh báo tài trợ chưa đưa tiền ----

test('tách tài trợ chưa đưa thành nhóm có và không có trong danh sách', () => {
  const ev = makeEvent({
    organizerId: 'a',
    people: BA_NGUOI,
    sponsors: [
      { id: 's1', ten: 'HungNN14', soTien: 800, personId: 'b', isPaid: false },
      { id: 's2', ten: 'Anh Tuấn', soTien: 300, personId: null, isPaid: false },
      { id: 's3', ten: 'Sếp', soTien: 500, personId: null, isPaid: true },
    ],
  });

  const { linked, outside, outsideTotal } = unpaidSponsors(ev);
  assert.equal(linked.length, 1);
  assert.equal(outside.length, 1);
  assert.equal(outsideTotal, 300, 'chỉ tính người ngoài chưa đưa tiền');
});

// ---- bất biến quan trọng ----

test('tổng thu không bao giờ vượt quá tổng chi', () => {
  const ev = makeEvent({
    organizerId: 'a',
    people: BA_NGUOI,
    rounds: [
      { id: 'r1', soTien: 800, nguoiTraId: 'a', thamGiaIds: ['a', 'b', 'c'] },
      { id: 'r2', soTien: 140, nguoiTraId: 'b', thamGiaIds: ['a', 'b', 'c'] },
    ],
  });

  const s = computeSummary(ev);
  const tongPhaiTra = Object.values(s.phaiTra).reduce((x, v) => x + v, 0);
  assert.ok(tongPhaiTra <= 940, `thu ${tongPhaiTra} không được vượt chi 940`);
});
