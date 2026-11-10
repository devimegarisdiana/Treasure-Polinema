import { ArrowUpRight, CalendarDays, Download, FileText } from 'lucide-react';
import './upcoming-agenda.css';

const BASE = (import.meta.env.BASE_URL as string).replace(/\/+$/, '');
const bookletUrl = `${BASE}/documents/treasure-2026-official-guidebook.pdf`;

export default function UpcomingAgenda() {
  return (
    <section className="section upcoming-agenda" id="upcoming-agenda" aria-labelledby="agenda-title">
      <div className="section-inner">
        <div className="section-heading">
          <div>
            <div className="section-label">For registered participants</div>
            <h2 id="agenda-title">Upcoming agenda.</h2>
          </div>
          <p>Prepare for the next step of TREASURE 2026.</p>
        </div>
        <div className="agenda-grid">
          <article className="agenda-meeting" data-testid="upcoming-technical-meeting">
            <div className="agenda-date" aria-hidden="true"><span>FRI / NOV</span><strong>13</strong><span>2026</span></div>
            <div className="agenda-content">
              <div className="section-label"><CalendarDays size={14} aria-hidden="true" /> Technical meeting</div>
              <h3>Let’s get ready.</h3>
              <time dateTime="2026-11-13">Friday, 13 November 2026</time>
              <p>Time and joining details will be announced by the committee.</p>
              <a className="agenda-text-link" href={`${BASE}/register`}>Participant portal <ArrowUpRight size={16} aria-hidden="true" /></a>
            </div>
          </article>
          <article className="agenda-booklet" aria-labelledby="booklet-title">
            <FileText className="agenda-booklet-icon" size={30} strokeWidth={1.2} aria-hidden="true" />
            <div className="section-label">Participant resources</div>
            <h3 id="booklet-title">Official guidebook</h3>
            <p>Read the official TREASURE guidebook for competition rules and preparation guidance.</p>
            <div className="agenda-booklet-actions">
              <a className="agenda-open" href={bookletUrl} target="_blank" rel="noopener noreferrer" data-testid="link-open-booklet">
                Open guidebook <ArrowUpRight size={16} aria-hidden="true" />
              </a>
              <a className="agenda-text-link" href={bookletUrl} download="TREASURE-2026-Official-Guidebook.pdf" data-testid="link-download-booklet">
                <Download size={15} aria-hidden="true" /> Download PDF
              </a>
            </div>
            <small>PDF · 12.3 MB. The guidebook contains the original registration deadline; the extended deadline was 10 November 2026 and registration is now closed.</small>
          </article>
        </div>
      </div>
    </section>
  );
}
