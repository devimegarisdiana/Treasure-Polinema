import { useBackfillRegistrationSpreadsheet } from '@workspace/api-client-react';

export function SpreadsheetBackfill({ onSessionExpired }: { onSessionExpired: () => void }) {
  const backfill = useBackfillRegistrationSpreadsheet({ mutation: { retry: false } });
  const queue = async () => {
    if (backfill.isPending || !window.confirm(
      'Queue all registrations missing from the Google Sheets queue in this hosting database? Existing queue entries will not be resent. No documents or passwords will be copied.',
    )) return;
    try {
      await backfill.mutateAsync();
    } catch (error) {
      if ((error as { status?: number })?.status === 401) onSessionExpired();
    }
  };
  const errorMessage = (backfill.error as { data?: { error?: unknown } } | null)?.data?.error;
  return (
    <section className="spreadsheet-backfill" aria-labelledby="spreadsheet-backfill-title">
      <div>
        <h2 id="spreadsheet-backfill-title">Previous registrations → Google Sheets</h2>
        <p>Run this on the live IDwebhost organizer dashboard to queue existing registrations from its database.
          Only registration summaries, member names and contact details are sent — never documents or passwords.</p>
        <p>Existing queue entries, including completed and failed updates, are left unchanged.
          Delivery runs automatically when Google Sheets sync is enabled and configured.</p>
        {backfill.data && <p role="status">
          <strong>{backfill.data.queuedCount} newly queued</strong>
          {' · '}{backfill.data.alreadyQueuedCount} already in the queue (including completed updates).
          {' '}Queued does not mean delivered to Google Sheets. It is safe to run this again.
        </p>}
        {backfill.isError && <p role="alert">
          {typeof errorMessage === 'string' ? errorMessage : 'The queue request could not be confirmed. It is safe to try again.'}
        </p>}
      </div>
      <button className="admin-secondary" type="button" disabled={backfill.isPending} onClick={() => void queue()}>
        {backfill.isPending ? 'Queuing…' : 'Queue previous registrations'}
      </button>
    </section>
  );
}
