/** One figure in a dashboard's list of them, with what makes it up underneath. Goes inside a `dl`. */
export function Figure({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-card bg-grey-100 px-4 py-3">
      <dt className="text-small text-grey-700">{label}</dt>
      <dd className="flex flex-col">
        <span className="text-h2 text-black tabular-nums">{value}</span>
        <span className="text-small text-grey-700">{detail}</span>
      </dd>
    </div>
  );
}
