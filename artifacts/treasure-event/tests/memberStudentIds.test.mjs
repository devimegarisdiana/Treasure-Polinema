import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { transformWithEsbuild } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { findMemberStudentId } from '../src/lib/memberStudentIds.ts';

const members = [
  { position: 0, fullName: 'Synthetic leader' },
  { position: 1, fullName: 'Synthetic member' },
];
const documents = [
  { id: 'member-id', purpose: 'student_id', memberPosition: 1, fileName: 'member.pdf', url: '/api/admin/registrations/test/documents/member' },
  { id: 'payment', purpose: 'payment_proof', memberPosition: null, fileName: 'payment.pdf', url: '/api/admin/registrations/test/documents/payment' },
  { id: 'leader-id', purpose: 'student_id', memberPosition: 0, fileName: 'leader.png', url: '/api/admin/registrations/test/documents/leader' },
];

test('each person gets their own student ID regardless of document order', () => {
  assert.equal(findMemberStudentId(members[0], members, documents).id, 'leader-id');
  assert.equal(findMemberStudentId(members[1], members, documents).id, 'member-id');
});

test('missing member IDs never reuse leader IDs or payment proof', () => {
  assert.equal(findMemberStudentId(members[1], members, documents.slice(1)), undefined);
  assert.equal(findMemberStudentId(members[0], members, [documents[1]]), undefined);
});

test('legacy IDs without person metadata belong only to the leader', () => {
  for (const legacy of [{ purpose: 'student_id' }, { purpose: 'student_id', memberPosition: null }]) {
    const oldMembers = [{ position: 2 }, { position: 1 }];
    assert.equal(findMemberStudentId(oldMembers[1], oldMembers, [legacy]), legacy);
    assert.equal(findMemberStudentId(oldMembers[0], oldMembers, [legacy]), undefined);
    assert.equal(findMemberStudentId(members[1], members, [legacy]), undefined);
  }
});

test('ambiguous legacy documents are not guessed or assigned to other members', () => {
  const ambiguous = [{ purpose: 'student_id' }, { purpose: 'student_id' }];
  assert.equal(findMemberStudentId(members[0], members, ambiguous), undefined);
  assert.equal(findMemberStudentId(members[1], members, ambiguous), undefined);
});

test('rendered member rows include the correct private link or explicit missing status', async () => {
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const temporary = await mkdtemp(join(root, 'src', 'tmp-member-test-'));
  try {
    const outfile = join(temporary, 'component.mjs');
    const filename = join(root, 'src/components/MemberStudentIds.tsx');
    const { code } = await transformWithEsbuild(await readFile(filename, 'utf8'), filename, { jsx: 'automatic' });
    await writeFile(outfile, code.replace('../lib/memberStudentIds', '../lib/memberStudentIds.ts'));
    const { default: Component } = await import(pathToFileURL(outfile).href);
    const render = (files) => renderToStaticMarkup(React.createElement(Component, { members, documents: files }));
    const row = (html, position) => html.match(new RegExp(`<li[^>]*data-testid="admin-member-${position}"[^>]*>(.*?)</li>`, 's'))[1];
    const html = render(documents);
    for (const [position, expected] of [[0, documents[2]], [1, documents[0]]]) {
      assert.ok(row(html, position).includes(`href="${expected.url}"`));
      assert.ok(row(html, position).includes(expected.fileName));
      assert.ok(row(html, position).includes(`aria-label="View student ID for ${members[position].fullName}"`));
      assert.ok(!row(html, position).includes(documents[1].url));
    }
    const old = render([{ ...documents[2], memberPosition: null }]);
    assert.ok(row(old, 0).includes(documents[2].url));
    assert.ok(!row(old, 1).includes('href='));
    assert.ok(row(old, 1).includes('Student ID not uploaded'));
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
