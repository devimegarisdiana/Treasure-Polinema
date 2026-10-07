import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowLeft, Plus, Printer, Trash2 } from 'lucide-react';
import { useCreateTeamRegistration, useRequestUploadUrl } from '@workspace/api-client-react';
import type { TeamRegistrationInput, TeamRegistrationReceipt } from '@workspace/api-client-react';
import { useAuth } from '@workspace/replit-auth-web';
import './registration.css';

type Lang = 'id' | 'en';
type Purpose = 'student_id' | 'payment_proof';
type UpStatus = 'idle' | 'uploading' | 'done' | 'error';
interface Up { status: UpStatus; name: string; uploadId: string; error: string; file: File | null }
interface Slot { uid: number; fullName: string }

const BASE = (import.meta.env.BASE_URL as string).replace(/\/+$/, '');
const home = `${BASE}/`;
const COUNTRIES = ['Indonesia', 'Philippines', 'England', 'Malaysia', 'Turkey', 'Vietnam', 'Thailand', 'Taiwan', 'Saudi Arabia', 'Other'] as const;
const MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
const MAX = 10 * 1024 * 1024;

const T = {
  id: {
    back: 'Beranda', lang: 'Pilih bahasa',
    eyebrow: 'Pendaftaran · TREASURE 2026', title: 'Daftarkan timmu.',
    intro: 'Isi data pendaftaran dan unggah dokumen. Setelah tersimpan, kamu mendapat kode referensi sebagai tanda terima data.',
    period: 'Pendaftaran', periodV: '12 Okt — 5 Nov 2026', training: 'Pelatihan', trainingV: '16—17 Nov 2026', comp: 'Kompetisi', compV: '23—25 Nov 2026',
    feeIdn: 'Mahasiswa Indonesia', feeInt: 'Mahasiswa internasional', contactH: 'Kontak', wa: 'WhatsApp Ms. Abryel',
    gateH: 'Masuk untuk mendaftar', gateP: 'Pendaftaran memerlukan login aman agar dokumenmu tersimpan privat. Situs tetap dapat diakses tanpa login.', signIn: 'Masuk dengan aman',
    loading: 'Memeriksa sesi login...', signedAs: 'Masuk sebagai', signOut: 'Keluar',
    expired: 'Sesimu berakhir. Isianmu masih ada di formulir. Masuk lagi di tab baru, lalu kembali ke tab ini dan kirim ulang.',
    leaderH: 'Ketua tim', membersH: 'Anggota tim (opsional)', nameHint: 'Tulis nama yang benar, karena akan dipakai untuk e-sertifikat.',
    fullName: 'Nama lengkap', memberLbl: 'Nama anggota', add: 'Tambah anggota', remove: 'Hapus',
    contactT: 'Kontak dan institusi', email: 'Email ketua', phone: 'WhatsApp ketua', altPhone: 'WhatsApp alternatif (anggota)',
    phoneHint: 'Boleh memakai +, angka, spasi, tanda hubung, titik, dan tanda kurung.',
    institution: 'Institusi', faculty: 'Fakultas / departemen', country: 'Negara asal', countryPick: 'Pilih negara', otherCountry: 'Tulis negara asalmu',
    compH: 'Kompetisi dan pelatihan', competition: 'Kompetisi yang diikuti', bs: 'Business Simulation', pc: 'Poster Competition', oth: 'Lainnya', otherComp: 'Tulis kompetisi lainnya',
    edugateQuestion: 'Pernah mengikuti pelatihan simulasi bisnis yang diselenggarakan Edugate sebelumnya?', yes: 'Ya', no: 'Tidak',
    docsH: 'Dokumen', docsHint: 'JPG, PNG, WebP, atau PDF. Maksimal 10 MB.',
    sid: 'Kartu mahasiswa ketua (hanya ketua)', pay: 'Bukti pembayaran pendaftaran', choose: 'Pilih berkas', replace: 'Ganti berkas', retry: 'Coba unggah lagi',
    uploading: 'Mengunggah', uploaded: 'Terunggah', badType: 'Format harus JPG, PNG, WebP, atau PDF.', tooBig: 'Ukuran berkas maksimal 10 MB.', upFail: 'Unggahan gagal. Coba lagi.',
    consent: 'Saya berwenang memberikan data ini dan setiap orang yang disebutkan mengetahui datanya digunakan untuk pendaftaran TREASURE 2026.',
    submit: 'Kirim pendaftaran', sending: 'Mengirim...', waitUp: 'Tunggu unggahan selesai.',
    r: 'Wajib diisi.', min: 'Minimal 2 karakter.', max: (n: number) => `Maksimal ${n} karakter.`,
    badEmail: 'Format email tidak valid.', badPhone: 'Gunakan 7–15 digit; boleh memakai +, spasi, ( ) . -', pick: 'Pilih salah satu.', needFile: 'Berkas wajib diunggah.', needConsent: 'Persetujuan wajib dicentang.',
    fixErrors: 'Periksa kolom yang ditandai. Isianmu tetap tersimpan di formulir.', failed: 'Pendaftaran belum terkirim. Isianmu tetap aman; coba kirim lagi.',
    okTag: 'Data diterima', okTitle: 'Data pendaftaran diterima.',
    okNote: 'Ini tanda terima data, bukan bukti pembayaran atau konfirmasi penerimaan. Simpan kode referensi ini dan hubungi panitia untuk langkah berikutnya.',
    ref: 'Kode referensi', at: 'Diterima pada', members: 'Nama terdaftar', print: 'Cetak tanda terima', newReg: 'Daftarkan tim lain', homeL: 'Kembali ke beranda',
    contactLine: 'Panitia: Ms. Abryel, WhatsApp +62 852-3076-2534 · Instagram @treasure_polinema',
  },
  en: {
    back: 'Home', lang: 'Choose language',
    eyebrow: 'Registration · TREASURE 2026', title: 'Register your team.',
    intro: 'Fill in the registration details and upload your documents. Once saved, you get a reference code as a receipt for your data.',
    period: 'Registration', periodV: '12 Oct — 5 Nov 2026', training: 'Training', trainingV: '16—17 Nov 2026', comp: 'Competition', compV: '23—25 Nov 2026',
    feeIdn: 'Indonesian students', feeInt: 'International students', contactH: 'Contact', wa: 'WhatsApp Ms. Abryel',
    gateH: 'Sign in to register', gateP: 'Registration needs a secure sign-in so your documents stay private. The rest of the site stays open without signing in.', signIn: 'Sign in securely',
    loading: 'Checking your sign-in...', signedAs: 'Signed in as', signOut: 'Sign out',
    expired: 'Your session expired. Your entries are still in the form. Sign in in the new tab, then return to this tab and resubmit.',
    leaderH: 'Team leader', membersH: 'Team members (optional)', nameHint: 'Write the correct name; it is used for the e-certificate.',
    fullName: 'Full name', memberLbl: 'Member name', add: 'Add member', remove: 'Remove',
    contactT: 'Contact and institution', email: 'Leader email', phone: 'Leader WhatsApp', altPhone: 'Alternative WhatsApp (member)',
    phoneHint: 'You may use +, digits, spaces, hyphens, dots and parentheses.',
    institution: 'Institution', faculty: 'Faculty / department', country: 'Country of origin', countryPick: 'Select a country', otherCountry: 'Enter your country',
    compH: 'Competition and training', competition: 'Competition', bs: 'Business Simulation', pc: 'Poster Competition', oth: 'Other', otherComp: 'Enter the other competition',
    edugateQuestion: 'Have you participated in any business simulation training conducted by Edugate before?', yes: 'Yes', no: 'No',
    docsH: 'Documents', docsHint: 'JPG, PNG, WebP or PDF. Maximum 10 MB.',
    sid: "Leader's student ID (leader only)", pay: 'Registration payment proof', choose: 'Choose file', replace: 'Replace file', retry: 'Retry upload',
    uploading: 'Uploading', uploaded: 'Uploaded', badType: 'File must be JPG, PNG, WebP or PDF.', tooBig: 'File must be 10 MB or smaller.', upFail: 'Upload failed. Please retry.',
    consent: 'I am authorized to provide this data and everyone named knows it is used for TREASURE 2026 registration.',
    submit: 'Submit registration', sending: 'Submitting...', waitUp: 'Wait for uploads to finish.',
    r: 'This field is required.', min: 'At least 2 characters.', max: (n: number) => `At most ${n} characters.`,
    badEmail: 'Enter a valid email address.', badPhone: 'Use 7–15 digits; +, spaces, ( ) . - are allowed.', pick: 'Choose one.', needFile: 'This file is required.', needConsent: 'Consent is required.',
    fixErrors: 'Check the highlighted fields. Your entries are still in the form.', failed: 'Registration was not sent. Your entries are safe; please try again.',
    okTag: 'Data received', okTitle: 'Registration data received.',
    okNote: 'This is a receipt for your data, not proof of payment or confirmation of acceptance. Keep this reference code and contact the organizers for next steps.',
    ref: 'Reference code', at: 'Received at', members: 'Names registered', print: 'Print receipt', newReg: 'Register another team', homeL: 'Back to home',
    contactLine: 'Organizers: Ms. Abryel, WhatsApp +62 852-3076-2534 · Instagram @treasure_polinema',
  },
} as const;

let uid = 0;
const slot = (): Slot => ({ uid: ++uid, fullName: '' });
const emptyUp = (): Up => ({ status: 'idle', name: '', uploadId: '', error: '', file: null });
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phoneRe = /^(?=(?:[^0-9]*[0-9]){7,15}[^0-9]*$)[+0-9() .-]+$/;
const receiptStorageKey = 'treasure-registration-receipt';
const readReceipt = (): TeamRegistrationReceipt | null => {
  try {
    const s = JSON.parse(sessionStorage.getItem(receiptStorageKey) ?? 'null');
    return s && typeof s.referenceCode === 'string' && /^TR26-[0-9A-F]{12}$/.test(s.referenceCode) &&
      typeof s.submittedAt === 'string' && Number.isFinite(Date.parse(s.submittedAt))
      ? { referenceCode: s.referenceCode, submittedAt: s.submittedAt } : null;
  } catch { return null; }
};
const newKey = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 3) | 8).toString(16);
      });
const statusOf = (e: unknown) => (e as { status?: number } | null)?.status;

export default function RegistrationPage() {
  const [lang, setLang] = useState<Lang>('id');
  const t = T[lang];
  const auth = useAuth();
  const [leader, setLeader] = useState('');
  const [slots, setSlots] = useState<Slot[]>(() => [slot(), slot(), slot(), slot()]);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [altPhone, setAltPhone] = useState('');
  const [institution, setInstitution] = useState('');
  const [faculty, setFaculty] = useState('');
  const [country, setCountry] = useState('');
  const [otherCountry, setOtherCountry] = useState('');
  const [competition, setCompetition] = useState('');
  const [otherComp, setOtherComp] = useState('');
  const [training, setTraining] = useState<boolean | null>(null);
  const [ups, setUps] = useState<Record<Purpose, Up>>({ student_id: emptyUp(), payment_proof: emptyUp() });
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState('');
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [attempted, setAttempted] = useState(false);
  const [serverError, setServerError] = useState('');
  const [expired, setExpired] = useState(false);
  const [receipt, setReceipt] = useState<TeamRegistrationReceipt | null>(readReceipt);
  const [sentCount, setSentCount] = useState(0);
  const mutation = useCreateTeamRegistration();
  const uploadUrl = useRequestUploadUrl();
  const formRef = useRef<HTMLFormElement>(null);
  const keyRef = useRef<string>(newKey());
  const tokens = useRef<Record<Purpose, number>>({ student_id: 0, payment_proof: 0 });

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = `${t.eyebrow} — TREASURE 2026`;
    for (const s of ['meta[name="description"]', 'meta[property="og:description"]', 'meta[name="twitter:description"]'])
      document.querySelector(s)?.setAttribute('content', t.intro);
    for (const s of ['meta[property="og:title"]', 'meta[name="twitter:title"]'])
      document.querySelector(s)?.setAttribute('content', document.title);
  }, [lang, t.eyebrow, t.intro]);

  const uploading = ups.student_id.status === 'uploading' || ups.payment_proof.status === 'uploading';
  const busy = mutation.isPending || uploading;
  const dirty = useMemo(
    () => !!(leader || email || phone || altPhone || institution || faculty || country || competition || training !== null || consent || website) ||
      slots.some((s) => s.fullName) || ups.student_id.status !== 'idle' || ups.payment_proof.status !== 'idle',
    [leader, email, phone, altPhone, institution, faculty, country, competition, training, consent, website, slots, ups],
  );
  useEffect(() => {
    if (!dirty || receipt) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty, receipt]);

  const req = (v: string, max: number) => {
    const s = v.trim();
    if (!s) return t.r;
    if (s.length < 2) return t.min;
    if (s.length > max) return t.max(max);
    return '';
  };
  const phoneErr = (v: string) => {
    const p = v.trim();
    if (!p) return t.r;
    return p.length < 7 || p.length > 40 || !phoneRe.test(p) ? t.badPhone : '';
  };
  const errors: Record<string, string> = {};
  const set = (k: string, v: string) => { if (v) errors[k] = v; };
  set('leader', req(leader, 160));
  slots.forEach((s) => { if (s.fullName.trim()) set(`s${s.uid}`, req(s.fullName, 160)); });
  const em = email.trim();
  set('email', !em ? t.r : !emailRe.test(em) || em.length > 254 ? t.badEmail : '');
  set('phone', phoneErr(phone));
  set('altPhone', phoneErr(altPhone));
  set('institution', req(institution, 200));
  set('faculty', req(faculty, 200));
  if (!country) errors.country = t.pick;
  if (country === 'Other') set('otherCountry', otherCountry.trim() ? (otherCountry.trim().length > 100 ? t.max(100) : '') : t.r);
  if (!competition) errors.competition = t.pick;
  if (competition === 'other') set('otherComp', otherComp.trim() ? (otherComp.trim().length > 160 ? t.max(160) : '') : t.r);
  if (training === null) errors.training = t.pick;
  (['student_id', 'payment_proof'] as Purpose[]).forEach((p) => { if (ups[p].status !== 'done') errors[p] = ups[p].error || t.needFile; });
  if (!consent) errors.consent = t.needConsent;

  const show = (k: string) => ((attempted || touched[k]) && errors[k] ? errors[k] : '');
  const touch = (k: string) => () => setTouched((s) => ({ ...s, [k]: true }));
  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? iso : new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-GB', { dateStyle: 'long', timeStyle: 'short' }).format(d);
  };

  const doUpload = async (purpose: Purpose, file: File) => {
    const token = ++tokens.current[purpose];
    const patch = (u: Partial<Up>) => { if (tokens.current[purpose] === token) setUps((s) => ({ ...s, [purpose]: { ...s[purpose], ...u } })); };
    if (!(MIME as readonly string[]).includes(file.type)) return patch({ status: 'error', name: file.name, file, uploadId: '', error: t.badType });
    if (file.size < 1 || file.size > MAX) return patch({ status: 'error', name: file.name, file, uploadId: '', error: t.tooBig });
    patch({ status: 'uploading', name: file.name, file, uploadId: '', error: '' });
    try {
      const { uploadId, uploadURL } = await uploadUrl.mutateAsync({
        data: { submissionKey: keyRef.current, purpose, name: file.name.slice(0, 200), size: file.size, contentType: file.type as (typeof MIME)[number] },
      });
      const res = await fetch(uploadURL, { method: 'PUT', body: file, headers: { 'Content-Type': file.type }, signal: AbortSignal.timeout(120000) });
      if (!res.ok) throw new Error(`PUT ${res.status}`);
      patch({ status: 'done', uploadId, error: '' });
    } catch (err) {
      if (statusOf(err) === 401) setExpired(true);
      patch({ status: 'error', uploadId: '', error: t.upFail });
    }
  };

  const onSubmit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (busy) return;
    setAttempted(true); setServerError(''); setExpired(false);
    if (Object.keys(errors).length) {
      setServerError(t.fixErrors);
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    const names = [leader, ...slots.map((s) => s.fullName)].map((n) => n.trim()).filter(Boolean);
    const data: TeamRegistrationInput = {
      submissionKey: keyRef.current,
      contactEmail: em,
      contactPhone: phone.trim(),
      alternativePhone: altPhone.trim(),
      institution: institution.trim(),
      facultyDepartment: faculty.trim(),
      countryOfOrigin: country as TeamRegistrationInput['countryOfOrigin'],
      ...(country === 'Other' ? { otherCountry: otherCountry.trim() } : {}),
      competition: competition as TeamRegistrationInput['competition'],
      ...(competition === 'other' ? { otherCompetition: otherComp.trim() } : {}),
      hasEdugateTraining: training as boolean,
      studentIdUploadId: ups.student_id.uploadId,
      paymentUploadId: ups.payment_proof.uploadId,
      members: names.map((fullName) => ({ fullName })),
      consent: true,
      ...(website ? { website } : {}),
    };
    try {
      const r = await mutation.mutateAsync({ data });
      setSentCount(names.length);
      setReceipt(r);
      try { sessionStorage.setItem(receiptStorageKey, JSON.stringify(r)); } catch { /* optional */ }
      window.scrollTo({ top: 0 });
    } catch (err) {
      if (statusOf(err) === 401) { setExpired(true); return; }
      const msg = (err as { data?: { error?: unknown } } | null)?.data?.error;
      setServerError(typeof msg === 'string' && msg ? `${t.failed} (${msg})` : t.failed);
    }
  };

  const reset = () => {
    try { sessionStorage.removeItem(receiptStorageKey); } catch { /* optional */ }
    setLeader(''); setSlots([slot(), slot(), slot(), slot()]); setEmail(''); setPhone(''); setAltPhone('');
    setInstitution(''); setFaculty(''); setCountry(''); setOtherCountry(''); setCompetition(''); setOtherComp('');
    setTraining(null); setUps({ student_id: emptyUp(), payment_proof: emptyUp() });
    tokens.current = { student_id: tokens.current.student_id + 1, payment_proof: tokens.current.payment_proof + 1 };
    setConsent(false); setWebsite(''); setTouched({}); setAttempted(false); setServerError(''); setExpired(false);
    setReceipt(null); setSentCount(0); keyRef.current = newKey(); mutation.reset();
  };

  const top = (
    <header className="reg-top">
      <a className="reg-brand" href={home} aria-label={t.homeL}>
        <img src={`${BASE}/treasure-wordmark.png`} alt="TREASURE 2026" />
      </a>
      <a className="reg-back" href={home} data-testid="link-home">
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
          <div className="reg-eyebrow" style={{ color: 'var(--treasure-blue)' }}>{t.okTag}</div>
          <h1 id="reg-ok" tabIndex={-1} ref={(el) => el?.focus()}>{t.okTitle}</h1>
          <div className="reg-note" role="status">{t.okNote}</div>
          <div>{t.ref}</div>
          <div className="reg-ref" data-testid="text-reference">{receipt.referenceCode}</div>
          <dl>
            <dt>{t.at}</dt><dd data-testid="text-submitted-at">{fmtDate(receipt.submittedAt)}</dd>
            {sentCount > 0 && <><dt>{t.members}</dt><dd>{sentCount}</dd></>}
          </dl>
          <p style={{ fontSize: 13, lineHeight: 1.6, marginTop: 20 }}>{t.contactLine}</p>
          <div className="reg-actions">
            <button type="button" className="reg-btn reg-yellow" onClick={() => window.print()} data-testid="button-print"><Printer size={15} /> {t.print}</button>
            <button type="button" className="reg-btn reg-ghost" onClick={reset} data-testid="button-new">{t.newReg}</button>
            <a className="reg-btn reg-ghost" href={home} data-testid="link-home-success">{t.homeL}</a>
          </div>
        </section>
      </div>
    );
  }

  const field = (
    k: string, id: string, label: string, value: string, setV: (v: string) => void,
    o: { type?: string; auto?: string; hint?: string; full?: boolean; max?: number; required?: boolean } = {},
  ) => {
    const err = show(k);
    const req = o.required !== false;
    return (
      <div className={`reg-field${o.full ? ' full' : ''}`}>
        <label htmlFor={id}>{label}{req ? ' *' : ''}</label>
        <input id={id} type={o.type ?? 'text'} value={value} autoComplete={o.auto ?? 'off'} maxLength={o.max} required={req} aria-required={req}
          onChange={(e) => setV(e.target.value)} onBlur={touch(k)} aria-invalid={err ? true : undefined}
          aria-describedby={[err ? `${id}-e` : '', o.hint ? `${id}-h` : ''].filter(Boolean).join(' ') || undefined} data-testid={`input-${id}`} />
        {o.hint && <span className="reg-hint" id={`${id}-h`}>{o.hint}</span>}
        {err && <span className="reg-err" id={`${id}-e`} role="alert">{err}</span>}
      </div>
    );
  };

  const radios = (k: string, label: string, value: string, opts: [string, string][], onPick: (v: string) => void) => {
    const err = show(k);
    return (
      <div className="reg-field full">
        <span className="lbl" id={`${k}-l`}>{label} *</span>
        <div className="reg-seg" role="radiogroup" tabIndex={-1} aria-labelledby={`${k}-l`} aria-required="true" aria-invalid={err ? true : undefined} aria-describedby={err ? `${k}-e` : undefined}>
          {opts.map(([v, l]) => (
            <label key={v}>
              <input type="radio" name={k} value={v} checked={value === v} onChange={() => onPick(v)} onBlur={touch(k)} data-testid={`radio-${k}-${v}`} />
              {l}
            </label>
          ))}
        </div>
        {err && <span className="reg-err" id={`${k}-e`} role="alert">{err}</span>}
      </div>
    );
  };

  const fileBox = (p: Purpose, label: string) => {
    const u = ups[p];
    const err = u.status === 'error' ? u.error : show(p);
    const inputId = `file-${p}`;
    return (
      <div className="reg-field full">
        <label htmlFor={inputId}>{label} *</label>
        <div className="reg-file">
          <input id={inputId} type="file" accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
            disabled={u.status === 'uploading' || mutation.isPending} required aria-required="true"
            aria-invalid={err ? true : undefined} aria-describedby={`${inputId}-s`} data-testid={`input-${inputId}`}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void doUpload(p, f); e.target.value = ''; }} />
          <div id={`${inputId}-s`} aria-live="polite">
            {u.status === 'uploading' && <div className="row"><span>{t.uploading}: {u.name}</span><div className="reg-bar" style={{ flex: '1 1 100%' }} role="progressbar" aria-label={t.uploading}><i /></div></div>}
            {u.status === 'done' && <div className="row"><span className="reg-ok">{t.uploaded}: {u.name}</span></div>}
            {u.status === 'error' && u.file && (
              <div className="row">
                <span className="reg-err">{u.name}</span>
                {u.error === t.upFail && <button type="button" className="reg-btn reg-ghost" onClick={() => u.file && void doUpload(p, u.file)} disabled={busy} data-testid={`button-retry-${p}`}>{t.retry}</button>}
              </div>
            )}
          </div>
          {u.status === 'done' && <span className="reg-hint">{t.replace}: {t.choose.toLowerCase()}</span>}
        </div>
        <span className="reg-hint">{t.docsHint}</span>
        {err && <span className="reg-err" role="alert">{err}</span>}
      </div>
    );
  };

  const name = [auth.user?.firstName, auth.user?.lastName].filter(Boolean).join(' ') || auth.user?.email || '';

  let body;
  if (auth.isLoading) {
    body = <div className="reg-gate" role="status" aria-live="polite" data-testid="status-auth-loading"><p>{t.loading}</p><div className="reg-skel" /></div>;
  } else if (!auth.isAuthenticated) {
    body = (
      <div className="reg-gate" data-testid="gate-login">
        {expired && <div className="reg-alert" role="alert">{t.expired}</div>}
        <h2>{t.gateH}</h2>
        <p>{t.gateP}</p>
        <button type="button" className="reg-btn reg-primary" onClick={expired ? auth.reauthenticate : auth.login} data-testid="button-login">{t.signIn}</button>
      </div>
    );
  } else {
    body = (
      <form className="reg-card" ref={formRef} onSubmit={onSubmit} noValidate data-testid="form-registration">
        <div className="reg-id">
          <span data-testid="text-identity">{t.signedAs} {name}</span>
          <button type="button" className="reg-btn reg-ghost" onClick={auth.logout} data-testid="button-logout">{t.signOut}</button>
        </div>
        {expired && (
          <div className="reg-alert" role="alert" data-testid="text-session-expired">
            {t.expired}{' '}
            <button type="button" className="reg-btn reg-yellow" style={{ minHeight: 44, marginTop: 10 }} onClick={auth.reauthenticate} data-testid="button-relogin">{t.signIn}</button>
          </div>
        )}
        {serverError && <div className="reg-alert" role="alert" data-testid="text-form-error">{serverError}</div>}

        <fieldset disabled={mutation.isPending}>
          <legend>{t.leaderH}</legend>
          <div className="reg-grid">
            {field('leader', 'leader-name', t.fullName, leader, setLeader, { full: true, hint: t.nameHint, max: 160, auto: 'name' })}
          </div>
        </fieldset>

        <fieldset disabled={mutation.isPending}>
          <legend>{t.membersH}</legend>
          <div className="reg-grid">
            {slots.map((s, i) => (
              <div key={s.uid} className="reg-field full" style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {field(`s${s.uid}`, `member-${s.uid}`, `${t.memberLbl} ${i + 1}`, s.fullName,
                    (v) => setSlots((a) => a.map((x) => (x.uid === s.uid ? { ...x, fullName: v } : x))), { full: true, hint: t.nameHint, max: 160, required: false })}
                </div>
                {i >= 4 && (
                  <button type="button" className="reg-btn reg-ghost" style={{ minHeight: 50, padding: '0 14px' }} aria-label={`${t.remove} ${i + 1}`}
                    onClick={() => setSlots((a) => a.filter((x) => x.uid !== s.uid))} data-testid={`button-remove-${i}`}><Trash2 size={14} /></button>
                )}
              </div>
            ))}
          </div>
          <button type="button" className="reg-btn reg-ghost reg-add" style={{ marginTop: 14 }} onClick={() => setSlots((a) => [...a, slot()])} data-testid="button-add-member">
            <Plus size={15} /> {t.add}
          </button>
        </fieldset>

        <fieldset disabled={mutation.isPending}>
          <legend>{t.contactT}</legend>
          <div className="reg-grid">
            {field('email', 'contact-email', t.email, email, setEmail, { type: 'email', auto: 'email', max: 254 })}
            {field('phone', 'contact-phone', t.phone, phone, setPhone, { type: 'tel', auto: 'tel', hint: t.phoneHint, max: 40 })}
            {field('altPhone', 'alt-phone', t.altPhone, altPhone, setAltPhone, { type: 'tel', auto: 'off', hint: t.phoneHint, max: 40, full: true })}
            {field('institution', 'institution', t.institution, institution, setInstitution, { max: 200, auto: 'organization' })}
            {field('faculty', 'faculty', t.faculty, faculty, setFaculty, { max: 200 })}
            <div className="reg-field full">
              <label htmlFor="country">{t.country} *</label>
              <select id="country" value={country} required aria-required="true" onChange={(e) => setCountry(e.target.value)} onBlur={touch('country')}
                aria-invalid={show('country') ? true : undefined} aria-describedby={show('country') ? 'country-e' : undefined} data-testid="select-country">
                <option value="">{t.countryPick}</option>
                {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              {show('country') && <span className="reg-err" id="country-e" role="alert">{show('country')}</span>}
            </div>
            {country === 'Other' && field('otherCountry', 'other-country', t.otherCountry, otherCountry, setOtherCountry, { full: true, max: 100 })}
          </div>
        </fieldset>

        <fieldset disabled={mutation.isPending}>
          <legend>{t.compH}</legend>
          <div className="reg-grid">
            {radios('competition', t.competition, competition, [['business_simulation', t.bs], ['poster_competition', t.pc], ['other', t.oth]], setCompetition)}
            {competition === 'other' && field('otherComp', 'other-competition', t.otherComp, otherComp, setOtherComp, { full: true, max: 160 })}
            {radios('training', t.edugateQuestion, training === null ? '' : training ? 'yes' : 'no', [['yes', t.yes], ['no', t.no]], (v) => setTraining(v === 'yes'))}
          </div>
        </fieldset>

        <fieldset>
          <legend>{t.docsH}</legend>
          <div className="reg-grid">
            {fileBox('student_id', t.sid)}
            {fileBox('payment_proof', t.pay)}
          </div>
        </fieldset>

        <div className="reg-hp" aria-hidden="true">
          <label htmlFor="reg-website">Website</label>
          <input id="reg-website" type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </div>

        <div className="reg-field" style={{ marginBottom: 20 }}>
          <label className="reg-consent" htmlFor="consent" style={{ textTransform: 'none', letterSpacing: 0, fontFamily: 'var(--app-font-sans)', fontSize: 14, color: '#39373F' }}>
            <input id="consent" type="checkbox" checked={consent} required aria-required="true" onChange={(e) => setConsent(e.target.checked)} onBlur={touch('consent')}
              disabled={mutation.isPending} aria-invalid={show('consent') ? true : undefined} aria-describedby={show('consent') ? 'consent-e' : undefined} data-testid="checkbox-consent" />
            <span>{t.consent}</span>
          </label>
          {show('consent') && <span className="reg-err" id="consent-e" role="alert">{show('consent')}</span>}
        </div>

        <button type="submit" className="reg-btn reg-primary" disabled={busy} aria-busy={mutation.isPending} data-testid="button-submit">
          {mutation.isPending && <span className="spin" aria-hidden="true" />}
          {mutation.isPending ? t.sending : uploading ? t.waitUp : t.submit}
        </button>
      </form>
    );
  }

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
            <div><span>{t.contactH}</span><a href="https://wa.me/6285230762534" style={{ color: 'var(--treasure-blue)' }} target="_blank" rel="noreferrer">{t.wa}</a></div>
            <div><span>Instagram</span><a href="https://www.instagram.com/treasure_polinema/" style={{ color: 'var(--treasure-blue)' }} target="_blank" rel="noreferrer">@treasure_polinema</a></div>
          </div>
        </aside>
        {body}
      </main>
    </div>
  );
}
