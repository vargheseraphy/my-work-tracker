/**
 * Choose which account you are filling in.
 *
 * One set of fields, switched between brands, rather than one set per brand. With three or four
 * brands a repeated column per account turns the form into a wall; this keeps it the same length
 * however many accounts a person runs.
 *
 * Values save as you type against the brand selected at the time, so switching never loses
 * anything and there is no separate save step per brand.
 */

import type { BrandDto, EntryValueDto, MetricDefinition } from '@gtm/shared';

/** How many per-brand measures that brand has an answer for, and how many there are. */
export function brandProgress(
  fields: MetricDefinition[],
  values: EntryValueDto[],
  brandId: string,
): { done: number; total: number } {
  const perBrand = fields.filter((f) => f.perBrand && f.valueType !== 'file');
  const done = perBrand.filter((f) =>
    values.some(
      (v) =>
        v.metricKey === f.key &&
        v.brandId === brandId &&
        (v.numValue !== null || (v.textValue ?? '') !== ''),
    ),
  ).length;
  return { done, total: perBrand.length };
}

export function BrandPicker({
  brands,
  value,
  onChange,
  fields,
  values,
}: {
  brands: BrandDto[];
  value: string;
  onChange: (brandId: string) => void;
  fields: MetricDefinition[];
  values: EntryValueDto[];
}) {
  if (brands.length === 0) return null;

  return (
    <div className="brand-pick card tight">
      <div className="brand-pick-main">
        <label htmlFor="brand-pick">Account</label>
        <select
          id="brand-pick"
          className="select"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          {brands.map((brand) => {
            const { done, total } = brandProgress(fields, values, brand.id);
            return (
              <option key={brand.id} value={brand.id}>
                {brand.name} · {done} of {total} filled
              </option>
            );
          })}
        </select>
      </div>

      <p className="hint">
        The fields below are for this account. Switch account to fill in the next one; everything
        saves as you type.
      </p>

      {/* A compact run of every account, so you can see what is left without opening the list. */}
      <ul className="brand-chips">
        {brands.map((brand) => {
          const { done, total } = brandProgress(fields, values, brand.id);
          const complete = total > 0 && done === total;
          return (
            <li key={brand.id}>
              <button
                type="button"
                className={`brand-chip${brand.id === value ? ' on' : ''}${
                  complete ? ' done' : ''
                }`}
                aria-current={brand.id === value ? 'true' : undefined}
                onClick={() => onChange(brand.id)}
              >
                {brand.name}
                <span className="brand-chip-count">
                  {complete ? 'Complete' : `${done}/${total}`}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
