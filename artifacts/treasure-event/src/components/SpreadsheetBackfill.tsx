import { useBackfillRegistrationSpreadsheet, useRefreshRegistrationDocuments } from '@workspace/api-client-react';

const errText = (e: unknown) => (e as { data?: { error?: unknown } } | null)?.data?.error;

export function SpreadsheetBackfill({ onSessionExpired }: { onSessionExpired: () => void }) {
  const backfill = useBackfillRegistrationSpreadsheet({ mutation: { retry: false } });
  const refresh = useRefreshRegistrationDocuments({ mutation: { retry: false } });
  const queue = async () => {
    if (backfill.isPending || !window.confirm(
      'Queue all registrations missing from the Google Sheets queue in this hosting database? Existing queue entries will not be resent. No documents or passwords will be copied.',
    )) return;
    try { await backfill.mutateAsync(); } catch (error) {
      if ((error as { status?: number })?.status === 401) onSessionExpired();
    }
  };
  const refreshDocs = async () => {
    if (refresh.isPending || !window.confirm(
      'Copy student ID (KTM) and payment proof files from the LIVE hosting server to the private Google Drive folder, and update the existing Google Sheet rows with their private links?\n\nFiles are not shared publicly and no emails are sent to participants. This is rejected on preview and when Google Drive is disabled.',
    )) return;
    try { await refresh.mutateAsync(); } catch (error) {
      if ((error as { status?: number })?.status === 401) onSessionExpired();
    }
  };
  const bErr = errText(backfill.error);
  const rErr = errText(refresh.error);
  return (
    <>
      <section className="spreadsheet-backfill" aria-labelledby="spreadsheet-backfill-title">
        <div>
          <h2 id="spreadsheet-backfill-title">Previous registrations → Google Sheets</h2>
          <p>Metadata only. Queues registration summaries, member names and contact details — never documents or passwords.
            Existing queue entries, including completed and failed updates, are left unchanged.</p>
          {backfill.data && <p role="status">
            <strong>{backfill.data.queuedCount} newly queued</strong>{' · '}{backfill.data.alreadyQueuedCount} already in the queue.
            {' '}Queued does not mean delivered. It is safe to run this again.
          </p>}
          {backfill.isError && <p role="alert">{typeof bErr === 'string' ? bErr : 'The queue request could not be confirmed. It is safe to try again.'}</p>}
        </div>
        <button className="admin-secondary" type="button" disabled={backfill.isPending} onClick={() => void queue()} data-testid="button-backfill-sheets">
          {backfill.isPending ? 'Queuing…' : 'Queue previous registrations'}
        </button>
      </section>
      <section className="spreadsheet-backfill" aria-labelledby="drive-refresh-title">
        <div>
          <h2 id="drive-refresh-title">Private documents → Google Drive</h2>
          <p>Copies KTM and payment proof files from the live hosting server into the private Google Drive folder and updates existing Sheet rows.
            Nothing is shared publicly and participants receive no email. Only available on the live server with Drive enabled.</p>
          {refresh.data && <p role="status">
            <strong>{refresh.data.queuedCount} newly queued</strong>{' · '}{refresh.data.alreadyQueuedCount} already queued.
            {' '}Queued does not mean copied yet.
          </p>}
          {refresh.isError && <p role="alert">{typeof rErr === 'string' ? rErr : 'The refresh request could not be confirmed. It is safe to try again.'}</p>}
        </div>
        <button className="admin-secondary" type="button" disabled={refresh.isPending} onClick={() => void refreshDocs()} data-testid="button-refresh-documents">
          {refresh.isPending ? 'Queuing…' : 'Refresh private documents'}
        </button>
      </section>
    </>
  );
}
