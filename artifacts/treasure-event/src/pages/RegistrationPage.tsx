import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowLeft, Plus, Printer, Trash2 } from 'lucide-react';
import { useCreateTeamRegistration } from '@workspace/api-client-react';
import type { TeamRegistrationInput, TeamRegistrationReceipt } from '@workspace/api-client-react';
import './registration.css';

type Lang = 'id' | 'en';
type Level = 'diploma' | 'undergraduate';
type Fee = 'indonesian' | 'international';
interface Member {
  uid: number;
  fullName: string;
  institution: string;
  studyProgram: string;
  educationLevel: Level | '';
  feeCategory: Fee | '';
}

const T = {
  id: {
    back: 'Beranda', lang: 'Pilih bahasa',
    eyebrow: 'Pendaftaran tim · TREASURE 2026',
    title: 'Daftarkan timmu.',
    intro: 'Isi data tim dan seluruh anggota. Setelah tersimpan, kamu mendapat kode referensi sebagai tanda terima data.',
    period: 'Pendaftaran', periodV: '12 Okt — 5 Nov 2026',
    training: 'Pelatihan', trainingV: '16—17 Nov 2026',
    comp: 'Kompetisi', compV: '23—25 Nov 2026',
    feeInfo: 'Biaya per orang (informasi)', feeIdn: 'Mahasiswa Indonesia', feeInt: 'Mahasiswa internasional',
    contactH: 'Kontak', wa: 'WhatsApp Ms. Abryel',
    teamH: 'Data tim', teamName: 'Nama tim', email: 'Email kontak', phone: 'Nomor telepon / WhatsApp',
    phoneHint: 'Boleh memakai +, angka, spasi, tanda hubung, dan tanda kurung.',
    membersH: 'Anggota tim', captain: 'Ketua tim', member: 'Anggota', remove: 'Hapus anggota', add: 'Tambah anggota',
    eligibility: 'Untuk mahasiswa aktif diploma atau sarjana di bidang akuntansi, ekonomi, manajemen, dan bisnis. Masukkan seluruh anggota; konfirmasikan ketentuan jumlah anggota kepada panitia.',
    fullName: 'Nama lengkap', institution: 'Institusi', program: 'Program studi',
    level: 'Jenjang', diploma: 'Diploma', undergrad: 'Sarjana', fee: 'Kategori biaya', idn: 'Indonesia', intl: 'Internasional',
    consent: 'Saya menyatakan seluruh anggota memenuhi syarat peserta. Saya berwenang memberikan data tim dan setiap anggota mengetahui datanya digunakan untuk pendaftaran TREASURE 2026.',
    summary: 'Ringkasan biaya informasi', people: 'orang', none: 'Tidak ada',
    summaryNote: 'Hanya informasi. Tidak ada pembayaran dilakukan di halaman ini.',
    submit: 'Kirim pendaftaran', sending: 'Mengirim...',
    r: 'Wajib diisi.', min: (n: number) => `Minimal ${n} karakter (tanpa spasi di tepi).`, max: (n: number) => `Maksimal ${n} karakter.`,
    badEmail: 'Format email tidak valid.', badPhone: 'Gunakan 7–15 digit; boleh memakai +, spasi, ( ) . -', pick: 'Pilih salah satu.',
    needConsent: 'Persetujuan wajib dicentang.',
    fixErrors: 'Periksa kolom yang ditandai. Isianmu tetap tersimpan di formulir.',
    failed: 'Pendaftaran belum terkirim. Isianmu tetap aman; coba kirim lagi.',
    okTag: 'Data diterima', okTitle: 'Data pendaftaran diterima.',
    okNote: 'Ini tanda terima data, bukan bukti pembayaran atau konfirmasi penerimaan tim. Simpan kode referensi ini dan hubungi panitia untuk langkah berikutnya.',
    ref: 'Kode referensi', at: 'Diterima pada', team: 'Tim', members: 'Anggota', print: 'Cetak tanda terima', newReg: 'Daftarkan tim lain', home: 'Kembali ke beranda',
    contactLine: 'Panitia: Ms. Abryel, WhatsApp +62 852-3076-2534 · Instagram @treasure_polinema',
  },
  en: {
    back: 'Home', lang: 'Choose language',
    eyebrow: 'Team registration · TREASURE 2026',
    title: 'Register your team.',
    intro: 'Enter your team and every member. Once saved, you get a reference code as a receipt for your data.',
    period: 'Registration', periodV: '12 Oct — 5 Nov 2026',
    training: 'Training', trainingV: '16—17 Nov 2026',
    comp: 'Competition', compV: '23—25 Nov 2026',
    feeInfo: 'Fee per person (information)', feeIdn: 'Indonesian students', feeInt: 'International students',
    contactH: 'Contact', wa: 'WhatsApp Ms. Abryel',
    teamH: 'Team details', teamName: 'Team name', email: 'Contact email', phone: 'Phone / WhatsApp number',
    phoneHint: 'You may use +, digits, spaces, hyphens, dots and parentheses.',
    membersH: 'Team members', captain: 'Team captain', member: 'Member', remove: 'Remove member', add: 'Add member',
    eligibility: 'For active diploma or undergraduate students in accounting, economics, management, and business. Include every member; confirm team-size rules with the organizers.',
    fullName: 'Full name', institution: 'Institution', program: 'Study program',
    level: 'Education level', diploma: 'Diploma', undergrad: 'Undergraduate', fee: 'Fee category', idn: 'Indonesian', intl: 'International',
    consent: 'I confirm that all members meet the eligibility requirements. I am authorized to provide their data, and each member knows it is used for TREASURE 2026 registration.',
    summary: 'Fee summary (information)', people: 'people', none: 'None',
    summaryNote: 'Information only. No payment is taken on this page.',
    submit: 'Submit registration', sending: 'Submitting...',
    r: 'This field is required.', min: (n: number) => `At least ${n} characters (excluding edge spaces).`, max: (n: number) => `At most ${n} characters.`,
    badEmail: 'Enter a valid email address.', badPhone: 'Use 7–15 digits; +, spaces, ( ) . - are allowed.', pick: 'Choose one.',
    needConsent: 'Consent is required.',
    fixErrors: 'Check the highlighted fields. Your entries are still in the form.',
    failed: 'Registration was not sent. Your entries are safe; please try again.',
    okTag: 'Data received', okTitle: 'Registration data received.',
    okNote: 'This is a receipt for your data, not proof of payment or confirmation that your team has been accepted. Keep this reference code and contact the organizers for next steps.',
    ref: 'Reference code', at: 'Received at', team: 'Team', members: 'Members', print: 'Print receipt', newReg: 'Register another team', home: 'Back to home',
    contactLine: 'Organizers: Ms. Abryel, WhatsApp +62 852-3076-2534 · Instagram @treasure_polinema',
  },
} as const;

let uidCounter = 0;
const blank = (): Member => ({ uid: ++uidCounter, fullName: '', institution: '', studyProgram: '', educationLevel: '', feeCategory: '' });
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phoneRe = /^(?=(?:[^0-9]*[0-9]){7,15}[^0-9]*$)[+0-9() .-]+$/;
const receiptStorageKey = 'treasure-registration-receipt';
const readReceipt = (): TeamRegistrationReceipt | null => {
  try {
    const saved = JSON.parse(sessionStorage.getItem(receiptStorageKey) ?? 'null');
    return saved && typeof saved.referenceCode === 'string' &&
      /^TR26-[0-9A-F]{12}$/.test(saved.referenceCode) &&
      typeof saved.submittedAt === 'string' && Number.isFinite(Date.parse(saved.submittedAt))
      ? { referenceCode: saved.referenceCode, submittedAt: saved.submittedAt } : null;
  } catch {
    return null;
  }
};
const newKey = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 3) | 8).toString(16);
      });

export default function RegistrationPage() {
  const [lang, setLang] = useState<Lang>('id');
  const t = T[lang];
  const [teamName, setTeamName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [members, setMembers] = useState<Member[]>(() => [blank(), blank()]);
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState('');
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [attempted, setAttempted] = useState(false);
  const [serverError, setServerError] = useState('');
  const [receipt, setReceipt] = useState<TeamRegistrationReceipt | null>(readReceipt);
  const [sentTeam, setSentTeam] = useState('');
  const [sentCount, setSentCount] = useState(0);
  const mutation = useCreateTeamRegistration();
  const formRef = useRef<HTMLFormElement>(null);
  const keyRef = useRef<{ key: string; sig: string } | null>(null);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = `${t.eyebrow} — TREASURE 2026`;
    for (const selector of ['meta[name="description"]', 'meta[property="og:description"]', 'meta[name="twitter:description"]']) {
      document.querySelector(selector)?.setAttribute('content', t.intro);
    }
    for (const selector of ['meta[property="og:title"]', 'meta[name="twitter:title"]']) {
      document.querySelector(selector)?.setAttribute('content', document.title);
    }
  }, [lang, t.eyebrow, t.intro]);

  const dirty = useMemo(
    () =>
      !!(teamName || email || phone || consent || website) ||
      members.some((m) => m.fullName || m.institution || m.studyProgram || m.educationLevel || m.feeCategory),
    [teamName, email, phone, consent, website, members],
  );
  useEffect(() => {
    if (!dirty || receipt) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty, receipt]);

  const text = (v: string, min: number, max: number) => {
    const s = v.trim();
    if (!s) return t.r;
    if (s.length < min) return t.min(min);
    if (s.length > max) return t.max(max);
    return '';
  };
  const errors: Record<string, string> = {};
  const e1 = text(teamName, 2, 120);
  if (e1) errors.teamName = e1;
  const em = email.trim();
  if (!em) errors.email = t.r;
  else if (!emailRe.test(em) || em.length > 254) errors.email = t.badEmail;
  const ph = phone.trim();
  if (!ph) errors.phone = t.r;
  else if (ph.length < 7 || ph.length > 40 || !phoneRe.test(ph)) errors.phone = t.badPhone;
  members.forEach((m) => {
    const a = text(m.fullName, 2, 160);
    if (a) errors[`${m.uid}.fullName`] = a;
    const b = text(m.institution, 2, 200);
    if (b) errors[`${m.uid}.institution`] = b;
    const c = text(m.studyProgram, 2, 160);
    if (c) errors[`${m.uid}.studyProgram`] = c;
    if (!m.educationLevel) errors[`${m.uid}.educationLevel`] = t.pick;
    if (!m.feeCategory) errors[`${m.uid}.feeCategory`] = t.pick;
  });
  if (!consent) errors.consent = t.needConsent;

  const show = (k: string) => (attempted || touched[k]) && errors[k] ? errors[k] : '';
  const touch = (k: string) => () => setTouched((s) => ({ ...s, [k]: true }));
  const upd = (uid: number, patch: Partial<Member>) =>
    setMembers((ms) => ms.map((m) => (m.uid === uid ? { ...m, ...patch } : m)));

  const nIdn = members.filter((m) => m.feeCategory === 'indonesian').length;
  const nInt = members.filter((m) => m.feeCategory === 'international').length;
  const idr = new Intl.NumberFormat('id-ID').format(nIdn * 300000);

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return isNaN(d.getTime())
      ? iso
      : new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-GB', { dateStyle: 'long', timeStyle: 'short' }).format(d);
  };

  const onSubmit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (mutation.isPending) return;
    setAttempted(true);
    setServerError('');
    if (Object.keys(errors).length) {
      setServerError(t.fixErrors);
      requestAnimationFrame(() =>
        formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      );
      return;
    }
    const body = {
      teamName: teamName.trim(),
      contactEmail: em,
      contactPhone: ph,
      members: members.map((m) => ({
        fullName: m.fullName.trim(),
        institution: m.institution.trim(),
        studyProgram: m.studyProgram.trim(),
        educationLevel: m.educationLevel as Level,
        feeCategory: m.feeCategory as Fee,
      })),
      consent: true as const,
      ...(website ? { website } : {}),
    };
    const sig = JSON.stringify(body);
    if (!keyRef.current || keyRef.current.sig !== sig) keyRef.current = { key: newKey(), sig };
    const data: TeamRegistrationInput = { submissionKey: keyRef.current.key, ...body };
    try {
      const r = await mutation.mutateAsync({ data });
      setSentTeam(body.teamName);
      setSentCount(body.members.length);
      setReceipt(r);
      // Keep only the non-personal receipt in this tab; never persist participant data.
      try {
        sessionStorage.setItem(receiptStorageKey, JSON.stringify(r));
      } catch {
        // Browser storage can be disabled; the saved receipt still renders normally.
      }
      window.scrollTo({ top: 0 });
    } catch (err) {
      const msg = (err as { data?: { error?: unknown } } | null)?.data?.error;
      setServerError(typeof msg === 'string' && msg ? `${t.failed} (${msg})` : t.failed);
    }
  };

  const reset = () => {
    try { sessionStorage.removeItem(receiptStorageKey); } catch { /* Storage is optional. */ }
    setTeamName(''); setEmail(''); setPhone(''); setMembers([blank(), blank()]);
    setConsent(false); setWebsite(''); setTouched({}); setAttempted(false);
    setServerError(''); setReceipt(null); keyRef.current = null; mutation.reset();
  };

  const top = (
    <header className="reg-top">
      <a className="reg-brand" href="/" aria-label={t.home}>
        <img src="/treasure-wordmark.png" alt="TREASURE 2026" />
      </a>
      <a className="reg-back" href="/" data-testid="link-home">
        <ArrowLeft size={14} style={{ verticalAlign: '-2px' }} /> <span>{t.back}</span>
      </a>
      <div className="reg-lang" role="group" aria-label={t.lang}>
        <button type="button" aria-pressed={lang === 'id'} onClick={() => setLang('id')} data-testid="button-lang-id">ID</button>
        <button type="button" aria-pressed={lang === 'en'} onClick={() => setLang('en')} data-testid="button-lang-en">EN</button>
      </div>
    </header>
  );

  if (receipt) {
    return (
      <div className="reg-page">
        {top}
        <section className="reg-receipt" aria-labelledby="reg-ok" data-testid="receipt">
          <div className="reg-eyebrow" style={{ color: '#A60010' }}>{t.okTag}</div>
          <h1 id="reg-ok" tabIndex={-1} ref={(el) => el?.focus()}>{t.okTitle}</h1>
          <div className="reg-note" role="status">{t.okNote}</div>
          <div>{t.ref}</div>
          <div className="reg-ref" data-testid="text-reference">{receipt.referenceCode}</div>
          <dl>
            <dt>{t.at}</dt><dd data-testid="text-submitted-at">{fmtDate(receipt.submittedAt)}</dd>
            {sentTeam && <><dt>{t.team}</dt><dd>{sentTeam}</dd></>}
            {sentCount > 0 && <><dt>{t.members}</dt><dd>{sentCount}</dd></>}
          </dl>
          <p style={{ fontSize: 13, lineHeight: 1.6, marginTop: 20 }}>{t.contactLine}</p>
          <div className="reg-actions">
            <button type="button" className="reg-btn reg-yellow" onClick={() => window.print()} data-testid="button-print">
              <Printer size={15} /> {t.print}
            </button>
            <button type="button" className="reg-btn reg-ghost" onClick={reset} data-testid="button-new">{t.newReg}</button>
            <a className="reg-btn reg-ghost" href="/" data-testid="link-home-success">{t.home}</a>
          </div>
        </section>
      </div>
    );
  }

  const field = (
    k: string, id: string, label: string, value: string, set: (v: string) => void,
    opts: { type?: string; auto?: string; hint?: string; full?: boolean; max?: number } = {},
  ) => {
    const err = show(k);
    return (
      <div className={`reg-field${opts.full ? ' full' : ''}`}>
        <label htmlFor={id}>{label}</label>
        <input
          id={id} type={opts.type ?? 'text'} value={value} autoComplete={opts.auto ?? 'off'}
          maxLength={opts.max} disabled={mutation.isPending}
          onChange={(e) => set(e.target.value)} onBlur={touch(k)}
          aria-invalid={err ? true : undefined}
          aria-describedby={[err ? `${id}-e` : '', opts.hint ? `${id}-h` : ''].filter(Boolean).join(' ') || undefined}
          data-testid={`input-${id}`}
        />
        {opts.hint && <span className="reg-hint" id={`${id}-h`}>{opts.hint}</span>}
        {err && <span className="reg-err" id={`${id}-e`} role="alert">{err}</span>}
      </div>
    );
  };

  const segment = (m: Member, kind: 'educationLevel' | 'feeCategory', label: string, options: [string, string][]) => {
    const k = `${m.uid}.${kind}`;
    const err = show(k);
    return (
      <div className="reg-field">
        <span className="lbl" id={`${k}-l`}>{label}</span>
        <div className="reg-seg" role="radiogroup" tabIndex={-1} aria-labelledby={`${k}-l`} aria-invalid={err ? true : undefined} aria-describedby={err ? `${k}-e` : undefined}>
          {options.map(([v, l]) => (
            <label key={v}>
              <input type="radio" name={k} value={v} checked={m[kind] === v}
                onChange={() => upd(m.uid, { [kind]: v } as Partial<Member>)} onBlur={touch(k)}
                data-testid={`radio-${kind}-${m.uid}-${v}`} />
              {l}
            </label>
          ))}
        </div>
        {err && <span className="reg-err" id={`${k}-e`} role="alert">{err}</span>}
      </div>
    );
  };

  return (
    <div className="reg-page">
      {top}
      <main className="reg-wrap">
        <aside className="reg-aside">
          <div className="reg-eyebrow">{t.eyebrow}</div>
          <h1>{t.title}</h1>
          <p>{t.intro}</p>
          <div className="reg-facts">
            <div><span>{t.period}</span><span>{t.periodV}</span></div>
            <div><span>{t.training}</span><span>{t.trainingV}</span></div>
            <div><span>{t.comp}</span><span>{t.compV}</span></div>
            <div><span>{t.feeIdn}</span><span>IDR 300.000</span></div>
            <div><span>{t.feeInt}</span><span>USD 20</span></div>
            <div><span>{t.contactH}</span><a href="https://wa.me/6285230762534" style={{ color: '#fff3da' }} target="_blank" rel="noreferrer">{t.wa}</a></div>
            <div><span>Instagram</span><a href="https://www.instagram.com/treasure_polinema/" style={{ color: '#fff3da' }} target="_blank" rel="noreferrer">@treasure_polinema</a></div>
          </div>
        </aside>

        <form className="reg-card" ref={formRef} onSubmit={onSubmit} noValidate data-testid="form-registration">
          {serverError && <div className="reg-alert" role="alert" data-testid="text-form-error">{serverError}</div>}

          <fieldset disabled={mutation.isPending}>
            <legend>{t.teamH}</legend>
            <div className="reg-grid">
              {field('teamName', 'team-name', t.teamName, teamName, setTeamName, { full: true, auto: 'organization', max: 120 })}
              {field('email', 'contact-email', t.email, email, setEmail, { type: 'email', auto: 'email', max: 254 })}
              {field('phone', 'contact-phone', t.phone, phone, setPhone, { type: 'tel', auto: 'tel', hint: t.phoneHint, max: 40 })}
            </div>
          </fieldset>

          <h2 className="reg-h">{t.membersH}</h2>
          <p className="reg-eligibility">{t.eligibility}</p>
          {members.map((m, i) => (
            <fieldset className="reg-member" key={m.uid} disabled={mutation.isPending} aria-labelledby={`member-heading-${m.uid}`} data-testid={`member-${i}`}>
              <div className="reg-mhead">
                <h3 id={`member-heading-${m.uid}`} className="reg-badge" style={{ padding: '5px 9px', fontSize: 11, fontFamily: "'DM Mono',monospace", marginBottom: 0 }}>
                  {i === 0 ? `01 · ${t.captain}` : `${String(i + 1).padStart(2, '0')} · ${t.member}`}
                </h3>
                {i > 0 && (
                  <button type="button" className="reg-btn reg-ghost" style={{ minHeight: 44, padding: '0 14px' }}
                    onClick={() => setMembers((ms) => ms.filter((x) => x.uid !== m.uid))}
                    aria-label={`${t.remove} ${i + 1}`} data-testid={`button-remove-${i}`}>
                    <Trash2 size={14} /> <span>{t.remove}</span>
                  </button>
                )}
              </div>
              <div className="reg-grid">
                {field(`${m.uid}.fullName`, `m${m.uid}-name`, t.fullName, m.fullName, (v) => upd(m.uid, { fullName: v }), { full: true, auto: 'off', max: 160 })}
                {field(`${m.uid}.institution`, `m${m.uid}-inst`, t.institution, m.institution, (v) => upd(m.uid, { institution: v }), { max: 200 })}
                {field(`${m.uid}.studyProgram`, `m${m.uid}-prog`, t.program, m.studyProgram, (v) => upd(m.uid, { studyProgram: v }), { max: 160 })}
                {segment(m, 'educationLevel', t.level, [['diploma', t.diploma], ['undergraduate', t.undergrad]])}
                {segment(m, 'feeCategory', t.fee, [['indonesian', t.idn], ['international', t.intl]])}
              </div>
            </fieldset>
          ))}
          <button type="button" className="reg-btn reg-ghost reg-add" disabled={mutation.isPending}
            onClick={() => setMembers((ms) => [...ms, blank()])} data-testid="button-add-member">
            <Plus size={15} /> {t.add}
          </button>

          <div className="reg-summary" aria-live="polite" data-testid="text-fee-summary">
            <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 6 }}>{t.summary}</div>
            {nIdn + nInt === 0 ? t.none : (
              <>
                {nIdn > 0 && <div>{nIdn} {t.people} × IDR 300.000 = <b>IDR {idr}</b></div>}
                {nInt > 0 && <div>{nInt} {t.people} × USD 20 = <b>USD {nInt * 20}</b></div>}
              </>
            )}
            <div style={{ color: '#b3b9d1', fontSize: 12, marginTop: 6 }}>{t.summaryNote}</div>
          </div>

          <div className="reg-hp" aria-hidden="true">
            <label htmlFor="reg-website">Website</label>
            <input id="reg-website" type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </div>

          <div className="reg-field" style={{ marginBottom: 20 }}>
            <label className="reg-consent" htmlFor="consent" style={{ textTransform: 'none', letterSpacing: 0, fontFamily: "'Manrope',sans-serif", fontSize: 14, color: '#111b45' }}>
              <input id="consent" type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} onBlur={touch('consent')}
                disabled={mutation.isPending}
                aria-invalid={show('consent') ? true : undefined} aria-describedby={show('consent') ? 'consent-e' : undefined} data-testid="checkbox-consent" />
              <span>{t.consent}</span>
            </label>
            {show('consent') && <span className="reg-err" id="consent-e" role="alert">{show('consent')}</span>}
          </div>

          <button type="submit" className="reg-btn reg-primary" disabled={mutation.isPending} aria-busy={mutation.isPending} data-testid="button-submit">
            {mutation.isPending && <span className="spin" aria-hidden="true" />}
            {mutation.isPending ? t.sending : t.submit}
          </button>
        </form>
      </main>
    </div>
  );
}
