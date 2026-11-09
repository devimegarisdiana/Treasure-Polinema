import { ArrowUpRight, FileText } from 'lucide-react';
import type { AdminRegistrationDocument, AdminRegistrationMember } from '@workspace/api-client-react';
import { findMemberStudentId } from '../lib/memberStudentIds';

export default function MemberStudentIds({ members, documents }: {
  members: AdminRegistrationMember[];
  documents: AdminRegistrationDocument[];
}) {
  return (
    <div className="detail-section">
      <h3>Team members <span>{members.length}</span></h3>
      <p className="member-student-note">Each participant’s student ID is listed below. Older registrations may not include every member’s ID.</p>
      <ol className="member-list">
        {members.map((member, index) => {
          const document = findMemberStudentId(member, members, documents);
          return (
            <li key={member.position} data-testid={`admin-member-${member.position}`}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <div className="member-student-copy">
                <strong>{member.fullName}</strong>
                {document ? <>
                  <a className="member-student-link" href={document.url} target="_blank" rel="noopener noreferrer"
                    aria-label={`View student ID for ${member.fullName}`} data-testid={`admin-member-id-${member.position}`}>
                    <FileText size={14} aria-hidden="true" /> View student ID <ArrowUpRight size={13} aria-hidden="true" />
                  </a>
                  <small className="member-student-filename">{document.fileName}</small>
                </> : <small className="member-student-missing" data-testid={`admin-member-id-missing-${member.position}`}>
                  Student ID not uploaded
                </small>}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
