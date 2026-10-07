import { useEffect } from 'react';
import { ArrowLeft, ArrowUpRight, Download, ExternalLink } from 'lucide-react';
import { edition2025 } from '../data/edition2025';
import './archive2025.css';

const BASE = (import.meta.env.BASE_URL as string).replace(/\/+$/, '');
const home = `${BASE}/`;
const registration = `${BASE}/register`;
const booklet = `${BASE}/${edition2025.bookletFile}`;
const cover = `${BASE}/${edition2025.coverFile}`;

export default function Archive2025Page() {
  useEffect(() => {
    const previousTitle = document.title;
    const previousLang = document.documentElement.lang;
    const descriptionSelectors = [
      'meta[name="description"]',
      'meta[property="og:description"]',
      'meta[name="twitter:description"]',
    ];
    const titleSelectors = ['meta[property="og:title"]', 'meta[name="twitter:title"]'];
    const previousMetadata = [...descriptionSelectors, ...titleSelectors].map((selector) => {
      const element = document.querySelector(selector);
      return { element, content: element?.getAttribute('content') ?? null };
    });
    document.documentElement.lang = 'en';
    document.title = 'TREASURE 2025 Archive — Official Program & Booklet';
    titleSelectors.forEach((selector) =>
      document.querySelector(selector)?.setAttribute('content', document.title),
    );
    descriptionSelectors.forEach((selector) =>
      document.querySelector(selector)?.setAttribute(
        'content',
        `Historical program information for the ${edition2025.edition} of TREASURE: ${edition2025.theme}. Includes its published schedule, competition categories and official booklet.`,
      ),
    );
    return () => {
      document.title = previousTitle;
      document.documentElement.lang = previousLang;
      previousMetadata.forEach(({ element, content }) => {
        if (!element) return;
        if (content === null) element.removeAttribute('content');
        else element.setAttribute('content', content);
      });
    };
  }, []);

  return (
    <main className="archive-page">
      <header className="archive-header">
        <a className="archive-brand" href={home} aria-label="TREASURE 2026 home">
          <img src={`${BASE}/treasure-wordmark.png`} alt="" />
          <span>2025 <i>Archive</i></span>
        </a>
        <nav className="archive-nav" aria-label="2025 archive sections">
          <a href="#program">Program</a>
          <a href="#schedule">Schedule</a>
          <a href="#categories">Categories</a>
          <a href="#booklet">Booklet</a>
        </nav>
        <a className="archive-current-link" href={home}>
          TREASURE 2026 <ArrowUpRight size={14} aria-hidden="true" />
        </a>
      </header>

      <div className="archive-main">
        <section className="archive-hero" id="program" aria-labelledby="archive-title">
          <div className="archive-hero-copy">
            <div className="archive-kicker"><span /> Historical program · 3rd edition</div>
            <h1 id="archive-title">TREASURE <em>2025</em></h1>
            <p className="archive-full-name">{edition2025.name}</p>
            <p className="archive-lede">{edition2025.summary}</p>
            <div className="archive-theme">
              <span className="archive-overline">The 2025 theme</span>
              <h2>{edition2025.theme}</h2>
              <p>{edition2025.themeSubtitle}</p>
            </div>
            <div className="archive-quickfacts" aria-label="2025 program at a glance">
              <div><span>Program dates</span><strong>{edition2025.dates}</strong></div>
              <div><span>Published location</span><strong>{edition2025.location}</strong></div>
              <div><span>Edition</span><strong>3rd international edition</strong></div>
            </div>
          </div>

          <aside className="archive-booklet-card" id="booklet" aria-labelledby="booklet-title">
            <div className="booklet-frame">
              <img src={cover} alt="Original cover of the official TREASURE 2025 booklet" />
            </div>
            <div className="booklet-caption">
              <div>
                <span className="archive-overline">Original source</span>
                <h2 id="booklet-title">Official 2025 booklet</h2>
                <p>Program information as published for the 2025 edition.</p>
              </div>
              <div className="booklet-actions">
                <a className="archive-action archive-action-primary" href={booklet} target="_blank" rel="noreferrer">
                  Open 2025 archive booklet <ExternalLink size={15} aria-hidden="true" />
                </a>
                <a className="archive-action archive-action-secondary" href={booklet} download="TREASURE-2025-official-booklet.pdf">
                  Download 2025 archive PDF <Download size={15} aria-hidden="true" />
                </a>
              </div>
            </div>
          </aside>
        </section>

        <aside className="archive-notice" role="note">
          <span className="archive-notice-mark" aria-hidden="true">!</span>
          <div>
            <strong>Historical reference only</strong>
            <p>{edition2025.archiveNotice}</p>
          </div>
          <a href={registration}>Register for TREASURE 2026 <ArrowUpRight size={14} aria-hidden="true" /></a>
        </aside>

        <section className="archive-section archive-schedule" id="schedule" aria-labelledby="schedule-title">
          <div className="archive-section-heading">
            <div>
              <span className="archive-overline">The published program</span>
              <h2 id="schedule-title">A schedule of<br /><em>planned milestones.</em></h2>
            </div>
            <p>Dates and activities below are reproduced from the official 2025 program. They are not event-result records.</p>
          </div>
          <ol className="archive-timeline">
            {edition2025.timeline.map((item, index) => (
              <li className="archive-timeline-item" key={item.dateTime}>
                <span className="archive-timeline-index">{String(index + 1).padStart(2, '0')}</span>
                <time dateTime={item.dateTime}>{item.date}</time>
                <h3>{item.title}</h3>
              </li>
            ))}
          </ol>
        </section>

        <section className="archive-section archive-categories" id="categories" aria-labelledby="categories-title">
          <div className="archive-section-heading archive-category-heading">
            <div>
              <span className="archive-overline">Competition format</span>
              <h2 id="categories-title">Two ways to<br /><em>put ideas to work.</em></h2>
            </div>
            <p>These descriptions reflect the planned competition categories in the 2025 booklet.</p>
          </div>
          <div className="archive-category-grid">
            {edition2025.categories.map((category, index) => (
              <article className={`archive-category-card archive-category-${index + 1}`} key={category.name}>
                <span className="archive-category-number">0{index + 1}</span>
                <div>
                  <h3>{category.name}</h3>
                  <p>{category.description}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="archive-program-note" aria-label="About the 2025 program">
          <div>
            <span className="archive-overline">About the edition</span>
            <h2>Ideas for a more circular future.</h2>
          </div>
          <div className="archive-program-copy">
            <p>{edition2025.background}</p>
            <p><strong>Hosted by</strong> {edition2025.host}</p>
            <p><strong>In collaboration with</strong> {edition2025.collaborator}</p>
          </div>
        </section>
      </div>

      <footer className="archive-footer">
        <a href={home} className="archive-footer-home"><ArrowLeft size={15} aria-hidden="true" /> TREASURE 2026 home</a>
        <span>2025 program archive · Official booklet source</span>
        <a href={registration}>Register for TREASURE 2026 <ArrowUpRight size={14} aria-hidden="true" /></a>
      </footer>
    </main>
  );
}
