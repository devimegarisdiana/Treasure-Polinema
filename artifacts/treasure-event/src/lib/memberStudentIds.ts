type Member = { position: number };
type StudentDocument = {
  purpose: string;
  memberPosition?: number | null;
};

export function findMemberStudentId<T extends StudentDocument>(
  member: Member,
  members: readonly Member[],
  documents: readonly T[],
): T | undefined {
  const studentIds = documents.filter((document) => document.purpose === 'student_id');
  const linked = studentIds.find((document) => document.memberPosition === member.position);
  if (linked) return linked;

  // Old registrations had only a leader ID. Never reuse that file for members.
  const leaderPosition = members.length ? Math.min(...members.map((person) => person.position)) : undefined;
  const legacy = studentIds.filter((document) => document.memberPosition == null);
  if (member.position === leaderPosition && legacy.length === 1 &&
      !studentIds.some((document) => document.memberPosition === leaderPosition)) {
    return legacy[0];
  }
  return undefined;
}
