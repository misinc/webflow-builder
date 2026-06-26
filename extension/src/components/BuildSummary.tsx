import { BuildResultRecord } from "@wfb/shared/contracts.js";

interface BuildSummaryProps {
  result: BuildResultRecord | null;
}

export function BuildSummary({ result }: BuildSummaryProps) {
  if (!result) {
    return <p className="empty-state">No build has been executed in this session.</p>;
  }

  return (
    <div className="summary">
      <div className={`status-pill ${result.success ? "is-success" : "is-error"}`}>
        {result.success ? "Build succeeded" : "Build failed"}
      </div>
      <dl className="summary-grid">
        <div>
          <dt>Section</dt>
          <dd>{result.insertedSectionName}</dd>
        </div>
        <div>
          <dt>Page</dt>
          <dd>{result.webflowPageId}</dd>
        </div>
        <div>
          <dt>Reused classes</dt>
          <dd>{result.reusedClasses.length}</dd>
        </div>
        <div>
          <dt>Created classes</dt>
          <dd>{result.createdClasses.length}</dd>
        </div>
      </dl>

      <div className="summary-columns">
        <section>
          <h4>Warnings</h4>
          <ul>
            {result.warnings.map((warning) => (
              <li key={`${warning.code}-${warning.message}`}>{warning.message}</li>
            ))}
          </ul>
        </section>
        <section>
          <h4>Missing assets</h4>
          <ul>
            {result.missingAssets.length > 0 ? (
              result.missingAssets.map((asset) => <li key={asset}>{asset}</li>)
            ) : (
              <li>None</li>
            )}
          </ul>
        </section>
      </div>

      {result.rollbackOutcome ? (
        <p className="rollback-note">
          Rollback: {result.rollbackOutcome.successful ? "successful" : "incomplete"}.
          {" "}
          {result.rollbackOutcome.details}
        </p>
      ) : null}
    </div>
  );
}
