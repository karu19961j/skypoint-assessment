import type { ApplicationStage } from "@/api/types";
import { APPLICATION_STAGES } from "@/api/types";
import { TagInput } from "@/components/TagInput";
import { stageLabel } from "@/lib/format";
import type { ApplicantFilterForm } from "@/lib/applicantFilters";

/**
 * The HR applicant-filter sidebar used by both `/hr/jobs/:id/applicants`
 * and `/hr/applicants`. Pages render their page-specific controls (job
 * dropdown, rank toggle, export button) themselves; this component owns
 * the shared 12-field filter surface.
 *
 * `idPrefix` namespaces the input ids so the two pages can coexist on
 * the same DOM without colliding `<label htmlFor>` references (matters
 * for testing libraries that query by label text).
 */
export function ApplicantFilterSidebar({
  value,
  onChange,
  onReset,
  idPrefix,
  children,
}: {
  value: ApplicantFilterForm;
  onChange: (next: ApplicantFilterForm) => void;
  onReset: () => void;
  idPrefix: string;
  /** Slot rendered at the top of the sidebar — page-specific filters
   *  like the "Job" dropdown on the cross-job view. */
  children?: React.ReactNode;
}) {
  const update = <K extends keyof ApplicantFilterForm>(
    key: K,
    next: ApplicantFilterForm[K],
  ) => onChange({ ...value, [key]: next });

  return (
    <aside className="card h-fit space-y-3 lg:sticky lg:top-4">
      <h2 className="text-sm font-semibold text-slate-700">Filter applicants</h2>

      {children}

      <div>
        <label className="label" htmlFor={`${idPrefix}-stage`}>Stage</label>
        <select
          id={`${idPrefix}-stage`}
          className="input"
          value={value.stage}
          onChange={(e) => update("stage", e.target.value as ApplicationStage | "")}
        >
          <option value="">All stages</option>
          {APPLICATION_STAGES.map((s) => (
            <option key={s} value={s}>{stageLabel(s)}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="label" htmlFor={`${idPrefix}-q`}>Search cover note / skills</label>
        <input
          id={`${idPrefix}-q`}
          className="input"
          placeholder="keyword"
          value={value.q}
          onChange={(e) => update("q", e.target.value)}
        />
      </div>

      <div>
        <label className="label" htmlFor={`${idPrefix}-skills-any`}>Skills (any of)</label>
        <TagInput
          id={`${idPrefix}-skills-any`}
          value={value.skills_any}
          onChange={(next) => update("skills_any", next)}
          placeholder="python, fastapi"
          ariaLabel="Match candidates with any of these skills"
        />
      </div>

      <div>
        <label className="label" htmlFor={`${idPrefix}-skills-all`}>Skills (all of)</label>
        <TagInput
          id={`${idPrefix}-skills-all`}
          value={value.skills_all}
          onChange={(next) => update("skills_all", next)}
          placeholder="python, postgres"
          ariaLabel="Match candidates with all of these skills"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label" htmlFor={`${idPrefix}-exp-min`}>Min exp</label>
          <input
            id={`${idPrefix}-exp-min`}
            className="input"
            type="number"
            min={0}
            value={value.exp_min}
            onChange={(e) => update("exp_min", e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor={`${idPrefix}-exp-max`}>Max exp</label>
          <input
            id={`${idPrefix}-exp-max`}
            className="input"
            type="number"
            min={0}
            value={value.exp_max}
            onChange={(e) => update("exp_max", e.target.value)}
          />
        </div>
      </div>

      <div>
        <label className="label" htmlFor={`${idPrefix}-current-ctc`}>Max current CTC</label>
        <input
          id={`${idPrefix}-current-ctc`}
          className="input"
          type="number"
          min={0}
          value={value.current_ctc_max}
          onChange={(e) => update("current_ctc_max", e.target.value)}
        />
      </div>

      <div>
        <label className="label" htmlFor={`${idPrefix}-expected-ctc`}>Max expected CTC</label>
        <input
          id={`${idPrefix}-expected-ctc`}
          className="input"
          type="number"
          min={0}
          value={value.expected_ctc_max}
          onChange={(e) => update("expected_ctc_max", e.target.value)}
        />
      </div>

      <div>
        <label className="label" htmlFor={`${idPrefix}-notice-bucket`}>Notice period</label>
        <select
          id={`${idPrefix}-notice-bucket`}
          className="input"
          value={value.notice_max_days}
          onChange={(e) => update("notice_max_days", e.target.value)}
        >
          <option value="">Any</option>
          <option value="0">Immediate joiner</option>
          <option value="15">≤ 15 days</option>
          <option value="30">≤ 30 days</option>
          <option value="60">≤ 60 days</option>
          <option value="90">≤ 90 days</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label" htmlFor={`${idPrefix}-applied-after`}>Applied after</label>
          <input
            id={`${idPrefix}-applied-after`}
            className="input"
            type="date"
            value={value.applied_after}
            onChange={(e) => update("applied_after", e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor={`${idPrefix}-applied-before`}>Applied before</label>
          <input
            id={`${idPrefix}-applied-before`}
            className="input"
            type="date"
            value={value.applied_before}
            onChange={(e) => update("applied_before", e.target.value)}
          />
        </div>
      </div>

      <div>
        <label className="label" htmlFor={`${idPrefix}-sort`}>Sort by</label>
        <select
          id={`${idPrefix}-sort`}
          className="input"
          value={value.sort}
          onChange={(e) => update("sort", e.target.value as ApplicantFilterForm["sort"])}
        >
          <option value="recent">Most recent</option>
          <option value="expected_ctc">Lowest expected CTC</option>
          <option value="notice">Shortest notice period</option>
          <option value="experience">Most experienced</option>
        </select>
      </div>

      <button onClick={onReset} className="btn-secondary w-full text-sm">
        Reset filters
      </button>
    </aside>
  );
}
