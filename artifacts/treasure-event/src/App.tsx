import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUpRight, Menu, X } from 'lucide-react';

const registrationUrl = '/register';
const archiveUrl = `${(import.meta.env.BASE_URL as string).replace(/\/+$/, '')}/archive/2025`;
const posterUrl = `${(import.meta.env.BASE_URL as string).replace(/\/+$/, '')}/treasure-poster-updated.png`;

const copy = {
  en: {
    home: 'TREASURE 2026 home',
    heroLogoAlt: 'TREASURE 4th edition — Strategic Minds, Competitive Moves: Simulating the Future of Business',
    openNav: 'Open navigation',
    closeNav: 'Close navigation',
    navLabel: 'Main navigation',
    navAbout: 'The competition',
    navDates: 'Key dates',
    navEligibility: 'Who can compete',
    navContact: 'Contact',
    navArchive: '2025 archive',
    register: 'Register',
    edition: 'The 4th International Business Competition',
    claim: 'Claim your place',
    exploreDates: 'Explore the dates',
    host: 'Accounting Department · Politeknik Negeri Malang',
    collaboration: 'In collaboration with Edugate',
    registration: 'Registration',
    training: 'Training',
    competition: 'Competition',
    aboutLabel: '01 / The invitation',
    aboutNote: "A competition for tomorrow's business minds",
    thinkBigger: 'Think bigger.',
    competeForward: 'Compete forward.',
    aboutText:
      'TREASURE returns for its fourth international edition, bringing active diploma and undergraduate students together to test their business thinking. Step into the challenge, sharpen your perspective, and simulate the future of business.',
    hostedText:
      'Hosted by the Accounting Department of Politeknik Negeri Malang in collaboration with Edugate.',
    datesLabel: '02 / Mark the calendar',
    datesTitle: 'Three dates.',
    datesTitleSecond: 'One big move.',
    datesNote: 'Make room for every step of TREASURE 2026.',
    detailsLabel: '03 / Make your move',
    detailsTitle: 'Built for the',
    detailsTitleSecond: 'business-minded.',
    detailsNote: 'Bring your knowledge. Bring your ambition.',
    eligibility: 'Who can compete',
    diploma: 'DIPLOMA / UNDERGRADUATE',
    challenge: 'Your next challenge starts here.',
    eligibilityText:
      'Open to active diploma or undergraduate students in accounting, economics, management, and business.',
    rewards: 'Rewards',
    rewardPitch: 'A reason to bring your strongest game.',
    prizePool: 'Total prize pool',
    prizeTotal: 'IDR 10 million+',
    fees: 'Registration fees',
    internationalStudents: 'International students',
    indonesianStudents: 'Indonesian students',
    feeLabel: 'Registration fee',
    posterLabel: '04 / The event announcement',
    posterTitle: 'All the details.',
    posterTitleSecond: 'One poster.',
    posterText:
      'Dates, registration fees, eligibility and contact information for the TREASURE 2026 competition.',
    viewPoster: 'View full poster',
    openPoster: 'Open the TREASURE 2026 event poster',
    registrationPeriod: 'Registration · 12 Oct—5 Nov 2026',
    finalTitle: 'Make your',
    finalTitleSecond: 'move count.',
    finalText:
      'Ready to compete? Register for TREASURE 2026 during the registration period and take your place in the challenge.',
    registerAt: 'Register your team',
    furtherInfo: 'Further information',
    contact: 'Contact',
    instagram: 'Instagram',
    hostedBy: 'Hosted by',
    footerCompetition: 'The 4th International Business Competition',
    backToTop: 'Back to top',
    posterAlt:
      'TREASURE 2026 official event poster with dates, fees, eligibility and registration information',
  },
} as const;

function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const t = copy.en;

  const closeMenu = () => setMenuOpen(false);

  useEffect(() => {
    document.documentElement.lang = 'en';
    document.title = 'TREASURE 2026 — International Business Competition';
  }, []);

  return (
    <main className="site">
      <header className="topbar">
        <a className="brand" href="#home" onClick={closeMenu} aria-label={t.home}>
          <img className="brand-logo" src="/treasure-wordmark.png" alt="" />
          <span className="brand-year">2026</span>
        </a>
        <button
          className="menu-toggle"
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label={menuOpen ? t.closeNav : t.openNav}
          aria-expanded={menuOpen}
        >
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
        <nav className={`nav${menuOpen ? ' open' : ''}`} aria-label={t.navLabel}>
          <a href="#about" onClick={closeMenu}>{t.navAbout}</a>
          <a href="#dates" onClick={closeMenu}>{t.navDates}</a>
          <a href="#details" onClick={closeMenu}>{t.navEligibility}</a>
          <a href="#contact" onClick={closeMenu}>{t.navContact}</a>
          <a href={archiveUrl} onClick={closeMenu}>{t.navArchive}</a>
          <a className="nav-register" href={registrationUrl} onClick={closeMenu}>
            {t.register} <ArrowUpRight size={13} />
          </a>
        </nav>
      </header>

      <section className="hero" id="home">
        <div className="hero-inner">
          <div className="fade-up">
            <div className="eyebrow"><span className="eyebrow-line" /> {t.edition}</div>
            <img className="hero-logo" src="/treasure-logo-fourth.png" alt={t.heroLogoAlt} />
            <p className="hero-copy">
              Strategic minds. Competitive moves. <strong>Simulating the future of business.</strong>
            </p>
            <div className="hero-actions">
              <a className="button button-light" href={registrationUrl}>
                {t.claim} <ArrowUpRight size={15} />
              </a>
              <a className="button button-ghost" href="#dates">
                {t.exploreDates} <ArrowDown size={14} />
              </a>
            </div>
          </div>
          <div className="hero-aside fade-up" style={{ animationDelay: '120ms' }}>
            <div className="poster-frame">
              <img src={posterUrl} alt={t.posterAlt} />
            </div>
          </div>
        </div>
        <div className="hero-facts" aria-label="TREASURE 2026 at a glance">
          <article className="hero-fact hero-fact-date">
            <span className="hero-fact-label">{t.registration}</span>
            <strong>12 Oct—5 Nov 2026</strong>
            <small>Training 16—17 Nov · Competition 23—25 Nov</small>
          </article>
          <article className="hero-fact hero-fact-eligibility">
            <span className="hero-fact-label">{t.eligibility}</span>
            <strong>Active diploma &amp; undergraduate students</strong>
            <small>Accounting, economics, management &amp; business</small>
          </article>
          <article className="hero-fact hero-fact-fees">
            <span className="hero-fact-label">{t.fees}</span>
            <strong>USD 20 <i>international</i></strong>
            <small>IDR 300k · Indonesian students</small>
          </article>
          <article className="hero-fact hero-fact-prize">
            <span className="hero-fact-label">{t.rewards}</span>
            <strong>{t.prizeTotal}</strong>
          </article>
        </div>
        <div className="hero-footer">
          <span>{t.host}</span>
          <strong>{t.collaboration}</strong>
        </div>
      </section>

      <div className="ticker" aria-label="TREASURE 2026 dates">
        <div className="ticker-track">
          {[0, 1].map((copy) => (
            <span key={copy}>
              <i /> {t.registration} · 12 Oct — 5 Nov 2026
              <i /> {t.training} · 16—17 Nov 2026
              <i /> {t.competition} · 23—25 Nov 2026 <i /> TREASURE 2026
            </span>
          ))}
        </div>
      </div>

      <section className="section" id="about">
        <div className="section-inner intro">
          <div>
            <div className="section-label">{t.aboutLabel}</div>
            <div className="index-note">{t.aboutNote}</div>
          </div>
          <div>
            <h2>{t.thinkBigger}<br /><em>{t.competeForward}</em></h2>
            <p>{t.aboutText}</p>
            <p>{t.hostedText}</p>
          </div>
        </div>
      </section>

      <section className="section dates" id="dates">
        <div className="section-inner">
          <div className="section-heading">
            <div>
              <div className="section-label">{t.datesLabel}</div>
              <h2>{t.datesTitle}<br />{t.datesTitleSecond}</h2>
            </div>
            <p>{t.datesNote}</p>
          </div>
          <div className="timeline">
            <div className="timeline-row">
              <span className="timeline-num">01</span>
              <h3>{t.registration}</h3>
              <time dateTime="2026-10-12">12 Oct — 5 Nov 2026</time>
            </div>
            <div className="timeline-row">
              <span className="timeline-num">02</span>
              <h3>{t.training}</h3>
              <time dateTime="2026-11-16">16—17 Nov 2026</time>
            </div>
            <div className="timeline-row">
              <span className="timeline-num">03</span>
              <h3>{t.competition}</h3>
              <time dateTime="2026-11-23">23—25 Nov 2026</time>
            </div>
          </div>
        </div>
      </section>

      <section className="section details" id="details">
        <div className="section-inner">
          <div className="section-heading">
            <div>
              <div className="section-label">{t.detailsLabel}</div>
              <h2>{t.detailsTitle}<br />{t.detailsTitleSecond}</h2>
            </div>
            <p>{t.detailsNote}</p>
          </div>
          <div className="details-grid">
            <article className="eligibility">
              <div className="section-label">{t.eligibility}</div>
              <div>
                <div className="big-04">{t.diploma}</div>
                <h3>{t.challenge}</h3>
                <p>{t.eligibilityText}</p>
              </div>
            </article>
            <article className="reward">
              <div className="section-label">{t.rewards}</div>
              <h3>{t.rewardPitch}</h3>
              <div className="reward-amount"><span>{t.prizePool}</span>{t.prizeTotal}</div>
            </article>
          </div>
          <div className="fees" aria-label={t.fees}>
            <div className="fee">
              <p>{t.internationalStudents}</p>
              <strong>USD 20</strong>
              <small>{t.feeLabel}</small>
            </div>
            <div className="fee">
              <p>{t.indonesianStudents}</p>
              <strong>IDR 300k</strong>
              <small>{t.feeLabel}</small>
            </div>
          </div>
        </div>
      </section>

      <section className="section poster-section" id="poster">
        <div className="section-inner poster-layout">
          <div className="poster-copy">
            <div className="section-label">{t.posterLabel}</div>
            <h2>{t.posterTitle}<br />{t.posterTitleSecond}</h2>
            <p>{t.posterText}</p>
            <a className="button button-light" href={posterUrl} target="_blank" rel="noreferrer">
              {t.viewPoster} <ArrowUpRight size={15} />
            </a>
          </div>
          <a className="poster-inline" href={posterUrl} target="_blank" rel="noreferrer" aria-label={t.openPoster}>
            <img src={posterUrl} alt={t.posterAlt} loading="lazy" />
          </a>
        </div>
      </section>

      <section className="registration" id="contact">
        <div className="registration-inner">
          <div>
            <div className="eyebrow"><span className="eyebrow-line" /> {t.registrationPeriod}</div>
            <h2>{t.finalTitle}<br />{t.finalTitleSecond}</h2>
            <p>{t.finalText}</p>
            <a className="button button-light" href={registrationUrl}>
              {t.registerAt} <ArrowUpRight size={15} />
            </a>
          </div>
          <div className="reg-meta">
            <div className="section-label further-info-label">{t.furtherInfo}</div>
            <div className="meta-row">
              <label>{t.contact}</label>
              <a href="tel:+6285230762534">+62 852-3076-2534 · Ms. Abryel</a>
            </div>
            <div className="meta-row">
              <label>{t.instagram}</label>
              <a href="https://www.instagram.com/treasure_polinema/" target="_blank" rel="noreferrer">@treasure_polinema</a>
            </div>
            <div className="meta-row">
              <label>{t.hostedBy}</label>
              <strong>{t.host}<br />{t.collaboration}</strong>
            </div>
          </div>
        </div>
      </section>

      <footer className="footer">
        <a className="brand" href="#home" aria-label={t.home}>
          <img className="brand-logo" src="/treasure-wordmark.png" alt="" />
          <span className="brand-year">2026</span>
        </a>
        <span>{t.footerCompetition}</span>
        <a href={archiveUrl}>2025 archive</a>
        <a href="#home">{t.backToTop} ↑</a>
      </footer>
    </main>
  );
}

export default App;
