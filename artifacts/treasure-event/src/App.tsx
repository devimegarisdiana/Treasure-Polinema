import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUpRight, Menu, X } from 'lucide-react';

const registrationUrl = 'http://treasure.polinema.com/';

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
    rewardsOver: 'Rewards over',
    upTo: 'Up to USD 560',
    fees: 'Registration fees',
    internationalStudents: 'International students',
    indonesianStudents: 'Indonesian students',
    feeLabel: 'Registration fee',
    posterLabel: '04 / The original announcement',
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
    registerAt: 'Register at treasure.polinema.com',
    furtherInfo: 'Further information',
    contact: 'Contact',
    instagram: 'Instagram',
    hostedBy: 'Hosted by',
    footerCompetition: 'The 4th International Business Competition',
    backToTop: 'Back to top',
    posterAlt:
      'TREASURE 2026 official event poster with dates, fees, eligibility and registration information',
  },
  id: {
    home: 'Beranda TREASURE 2026',
    heroLogoAlt: 'TREASURE edisi ke-4 — Strategic Minds, Competitive Moves: Simulating the Future of Business',
    openNav: 'Buka navigasi',
    closeNav: 'Tutup navigasi',
    navLabel: 'Navigasi utama',
    navAbout: 'Tentang kompetisi',
    navDates: 'Jadwal',
    navEligibility: 'Syarat peserta',
    navContact: 'Kontak',
    register: 'Daftar',
    edition: 'Kompetisi Bisnis Internasional ke-4',
    claim: 'Daftar sekarang',
    exploreDates: 'Lihat jadwal',
    host: 'Departemen Akuntansi · Politeknik Negeri Malang',
    collaboration: 'Berkolaborasi dengan Edugate',
    registration: 'Pendaftaran',
    training: 'Pelatihan',
    competition: 'Kompetisi',
    aboutLabel: '01 / Undangan',
    aboutNote: 'Kompetisi untuk calon pemimpin bisnis',
    thinkBigger: 'Berpikir lebih besar.',
    competeForward: 'Melangkah lebih maju.',
    aboutText:
      'TREASURE kembali untuk edisi internasional keempat, mengajak mahasiswa aktif program diploma dan sarjana untuk menguji wawasan bisnis. Terima tantangannya, perluas perspektif, dan simulasikan masa depan bisnis.',
    hostedText:
      'Diselenggarakan oleh Departemen Akuntansi Politeknik Negeri Malang berkolaborasi dengan Edugate.',
    datesLabel: '02 / Catat tanggalnya',
    datesTitle: 'Tiga tanggal.',
    datesTitleSecond: 'Satu langkah besar.',
    datesNote: 'Ikuti setiap tahap TREASURE 2026.',
    detailsLabel: '03 / Saatnya melangkah',
    detailsTitle: 'Untuk calon',
    detailsTitleSecond: 'pemimpin bisnis.',
    detailsNote: 'Bawa pengetahuan dan ambisimu.',
    eligibility: 'Siapa yang bisa ikut',
    diploma: 'DIPLOMA / SARJANA',
    challenge: 'Langkah berikutnya dimulai di sini.',
    eligibilityText:
      'Terbuka bagi mahasiswa aktif program diploma atau sarjana di bidang akuntansi, ekonomi, manajemen, dan bisnis.',
    rewards: 'Hadiah',
    rewardPitch: 'Saatnya tampil dengan kemampuan terbaik.',
    rewardsOver: 'Total hadiah lebih dari',
    upTo: 'Hingga USD 560',
    fees: 'Biaya pendaftaran',
    internationalStudents: 'Mahasiswa internasional',
    indonesianStudents: 'Mahasiswa Indonesia',
    feeLabel: 'Biaya pendaftaran',
    posterLabel: '04 / Pengumuman resmi',
    posterTitle: 'Semua detail.',
    posterTitleSecond: 'Dalam satu poster.',
    posterText:
      'Jadwal, biaya pendaftaran, syarat peserta, dan informasi kontak TREASURE 2026.',
    viewPoster: 'Lihat poster lengkap',
    openPoster: 'Buka poster acara TREASURE 2026',
    registrationPeriod: 'Pendaftaran · 12 Okt—5 Nov 2026',
    finalTitle: 'Tunjukkan',
    finalTitleSecond: 'kemampuanmu.',
    finalText:
      'Siap berkompetisi? Daftar TREASURE 2026 selama periode pendaftaran dan ambil bagian dalam tantangannya.',
    registerAt: 'Daftar di treasure.polinema.com',
    furtherInfo: 'Informasi lebih lanjut',
    contact: 'Kontak',
    instagram: 'Instagram',
    hostedBy: 'Diselenggarakan oleh',
    footerCompetition: 'Kompetisi Bisnis Internasional ke-4',
    backToTop: 'Kembali ke atas',
    posterAlt:
      'Poster resmi TREASURE 2026 berisi jadwal, biaya, syarat peserta, dan informasi pendaftaran',
  },
} as const;

function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [language, setLanguage] = useState<'id' | 'en'>('id');
  const t = copy[language];

  const closeMenu = () => setMenuOpen(false);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  return (
    <main className="site">
      <header className="topbar">
        <a className="brand" href="#home" onClick={closeMenu} aria-label={t.home}>
          <img className="brand-logo" src="/treasure-wordmark.png" alt="" />
          <span className="brand-year">2026</span>
        </a>
        <div className="language-switch" role="group" aria-label="Pilih bahasa / Choose language">
          <button
            type="button"
            onClick={() => setLanguage('id')}
            aria-pressed={language === 'id'}
          >
            ID
          </button>
          <span aria-hidden="true">/</span>
          <button
            type="button"
            onClick={() => setLanguage('en')}
            aria-pressed={language === 'en'}
          >
            EN
          </button>
        </div>
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
          <a className="nav-register" href={registrationUrl} target="_blank" rel="noreferrer" onClick={closeMenu}>
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
              {language === 'id'
                ? <>Strategi tajam. Langkah kompetitif. <strong>Simulasikan masa depan bisnis.</strong></>
                : <>Strategic minds. Competitive moves. <strong>Simulating the future of business.</strong></>}
            </p>
            <div className="hero-actions">
              <a className="button button-light" href={registrationUrl} target="_blank" rel="noreferrer">
                {t.claim} <ArrowUpRight size={15} />
              </a>
              <a className="button button-ghost" href="#dates">
                {t.exploreDates} <ArrowDown size={14} />
              </a>
            </div>
          </div>
          <div className="hero-aside fade-up" style={{ animationDelay: '120ms' }}>
            <div className="poster-frame">
              <img src="/treasure-poster.png" alt={t.posterAlt} />
            </div>
          </div>
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
              <i /> {t.registration} · {language === 'id' ? '12 Okt' : '12 Oct'} — 5 Nov 2026
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
              <time dateTime="2026-10-12">{language === 'id' ? '12 Okt' : '12 Oct'} — 5 Nov 2026</time>
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
              <div className="reward-amount"><span>{t.rewardsOver}</span>IDR 10 million</div>
              <div>{t.upTo}</div>
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
            <a className="button button-light" href="/treasure-poster.png" target="_blank" rel="noreferrer">
              {t.viewPoster} <ArrowUpRight size={15} />
            </a>
          </div>
          <a className="poster-inline" href="/treasure-poster.png" target="_blank" rel="noreferrer" aria-label={t.openPoster}>
            <img src="/treasure-poster.png" alt={t.posterAlt} loading="lazy" />
          </a>
        </div>
      </section>

      <section className="registration" id="contact">
        <div className="registration-inner">
          <div>
            <div className="eyebrow"><span className="eyebrow-line" /> {t.registrationPeriod}</div>
            <h2>{t.finalTitle}<br />{t.finalTitleSecond}</h2>
            <p>{t.finalText}</p>
            <a className="button button-light" href={registrationUrl} target="_blank" rel="noreferrer">
              {t.registerAt} <ArrowUpRight size={15} />
            </a>
          </div>
          <div className="reg-meta">
            <div className="section-label" style={{ color: '#f4d832' }}>{t.furtherInfo}</div>
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
        <a href="#home">{t.backToTop} ↑</a>
      </footer>
    </main>
  );
}

export default App;
