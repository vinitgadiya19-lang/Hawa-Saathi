import React, { useMemo, useRef, useState } from 'react';
import { Table } from 'lucide-react';
import { HourlyAirQualityPoint } from '../types/airQuality';
import { getAqiBand } from '../utils/aqi';

interface HourlyBarChartProps {
  hourly24: HourlyAirQualityPoint[];
}

function HourlyForecastTable({ hourly24 }: { hourly24: HourlyAirQualityPoint[] }) {
  return (
    <div
      id="hourly-forecast-table"
      className="mt-4 rounded-2xl border-2 border-[#141414] bg-[#FFFDF8] overflow-x-auto"
    >
      <table className="w-full text-left text-xs sm:text-sm border-collapse">
        <caption className="sr-only">
          Hourly 24-hour US AQI and PM2.5 forecast data table
        </caption>
        <thead>
          <tr className="bg-[#FFF3B0] border-b-2 border-[#141414] text-[#141414]">
            <th scope="col" className="py-2.5 px-3 font-extrabold">Hour</th>
            <th scope="col" className="py-2.5 px-3 font-extrabold">US AQI</th>
            <th scope="col" className="py-2.5 px-3 font-extrabold">Band</th>
            <th scope="col" className="py-2.5 px-3 font-extrabold">PM2.5 (µg/m³)</th>
          </tr>
        </thead>
        <tbody>
          {hourly24.map((pt) => {
            const band = typeof pt.us_aqi === 'number' ? getAqiBand(pt.us_aqi) : null;
            return (
              <tr key={pt.time} className="border-b border-[#141414]/15">
                <td className="py-2 px-3 font-mono font-bold text-[#141414]">{pt.hourLabel}</td>
                <td className="py-2 px-3 font-mono font-bold text-[#141414] tabular-nums">
                  {typeof pt.us_aqi === 'number' ? Math.round(pt.us_aqi) : '—'}
                </td>
                <td className="py-2 px-3 font-semibold text-[#141414]">
                  {band ? band.label : 'Unavailable'}
                </td>
                <td className="py-2 px-3 font-mono text-[#3F3F46] tabular-nums">
                  {typeof pt.pm2_5 === 'number' ? pt.pm2_5.toFixed(1) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function HourlyBarChart({ hourly24 }: HourlyBarChartProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showDataTable, setShowDataTable] = useState(false);
  const barRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const chartSummary = useMemo(() => {
    const valid = hourly24.filter((p): p is HourlyAirQualityPoint & { us_aqi: number } =>
      typeof p.us_aqi === 'number'
    );
    if (valid.length === 0) return 'Hourly forecast values unavailable.';
    let minPt = valid[0];
    let maxPt = valid[0];
    for (const pt of valid) {
      if (pt.us_aqi < minPt.us_aqi) minPt = pt;
      if (pt.us_aqi > maxPt.us_aqi) maxPt = pt;
    }
    return `24-hour forecast summary: lowest expected at ${minPt.hourLabel} (${Math.round(minPt.us_aqi)} US AQI), highest expected at ${maxPt.hourLabel} (${Math.round(maxPt.us_aqi)} US AQI).`;
  }, [hourly24]);

  if (hourly24.length === 0) {
    return (
      <div className="brutal-card bg-white rounded-2xl p-5 text-center">
        <p className="text-base font-bold text-[#141414]">Live 24-hour forecast unavailable</p>
      </div>
    );
  }

  const safeIndex = Math.min(selectedIndex, hourly24.length - 1);
  const selectedPoint = hourly24[safeIndex];
  const selectedBand =
    typeof selectedPoint.us_aqi === 'number' ? getAqiBand(selectedPoint.us_aqi) : null;

  const numericValues = hourly24
    .map((p) => p.us_aqi)
    .filter((v): v is number => typeof v === 'number');
  const maxVal = Math.max(150, ...numericValues);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const next = Math.min(hourly24.length - 1, index + 1);
      setSelectedIndex(next);
      barRefs.current[next]?.focus();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prev = Math.max(0, index - 1);
      setSelectedIndex(prev);
      barRefs.current[prev]?.focus();
    }
  };

  return (
    <section
      aria-labelledby="hourly-chart-heading"
      className="brutal-card bg-white rounded-3xl p-4 sm:p-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h2
            id="hourly-chart-heading"
            className="font-serif text-2xl sm:text-3xl font-bold text-[#141414]"
          >
            Next 24 Hours
          </h2>
          <p className="text-sm font-semibold text-[#3F3F46]">
            Tap or arrow through any hour bar to check expected air quality
          </p>
          <p className="sr-only">{chartSummary}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div
            aria-live="polite"
            className={`rounded-xl border-2 border-[#141414] px-3.5 py-2 flex items-center gap-3 ${
              selectedBand ? selectedBand.bgClass : 'bg-[#FFFDF2]'
            } ${selectedBand ? selectedBand.textColorClass : 'text-[#141414]'}`}
          >
            <div>
              <div className="text-xs font-bold uppercase tracking-wide opacity-90">
                {selectedPoint.hourLabel}
              </div>
              <div className="font-mono text-xl font-bold tabular-nums leading-none mt-0.5">
                {typeof selectedPoint.us_aqi === 'number'
                  ? `${Math.round(selectedPoint.us_aqi)} AQI`
                  : 'No data'}
              </div>
            </div>
            <div className="h-8 w-[2px] bg-current opacity-25" aria-hidden="true" />
            <div className="text-xs sm:text-sm font-bold leading-tight">
              <div>{selectedBand ? selectedBand.label : 'Unavailable'}</div>
              <div className="font-mono font-semibold opacity-90 tabular-nums">
                {typeof selectedPoint.pm2_5 === 'number'
                  ? `PM2.5: ${selectedPoint.pm2_5.toFixed(1)} µg/m³`
                  : 'PM2.5: —'}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowDataTable((prev) => !prev)}
            aria-expanded={showDataTable}
            aria-controls="hourly-forecast-table"
            className="brutal-btn bg-[#FFFDF2] text-[#141414] hover:bg-[#FFF3B0] font-bold text-xs sm:text-sm px-3.5 py-2 rounded-xl inline-flex items-center gap-1.5 min-h-[44px] cursor-pointer"
          >
            <Table className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{showDataTable ? 'Hide data table' : 'Show data table'}</span>
          </button>
        </div>
      </div>

      <div className="relative rounded-2xl border-2 border-[#141414] bg-[#FFFDF8] p-3 sm:p-4 overflow-x-auto">
        <div className="min-w-[520px]">
          <div className="relative h-48 sm:h-56 flex items-end gap-1 sm:gap-1.5 pt-6 pb-1">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-6 bottom-1 flex flex-col justify-between"
            >
              {[1, 0.66, 0.33, 0].map((fraction) => (
                <div key={fraction} className="w-full border-t border-[#93C5FD] flex items-center">
                  <span className="font-mono text-[11px] font-bold text-[#3F3F46] bg-[#FFFDF8] pr-1.5 -mt-2.5 tabular-nums">
                    {Math.round(maxVal * fraction)}
                  </span>
                </div>
              ))}
            </div>

            {hourly24.map((point, index) => {
              const hasValue = typeof point.us_aqi === 'number';
              const aqiVal = hasValue ? Math.round(point.us_aqi as number) : 0;
              const heightPct = hasValue
                ? Math.max(10, Math.min(100, (aqiVal / maxVal) * 100))
                : 8;
              const band = hasValue ? getAqiBand(aqiVal) : null;
              const isSelected = index === safeIndex;

              return (
                <div
                  key={point.time}
                  className="relative z-10 flex-1 h-full flex flex-col justify-end items-center"
                >
                  <button
                    ref={(el) => {
                      barRefs.current[index] = el;
                    }}
                    type="button"
                    onClick={() => setSelectedIndex(index)}
                    onKeyDown={(e) => handleKeyDown(e, index)}
                    aria-pressed={isSelected}
                    aria-label={`${point.hourLabel}: ${
                      hasValue ? `${aqiVal} US AQI, ${band?.label}` : 'Air quality unavailable'
                    }`}
                    style={{
                      height: `${heightPct}%`,
                      backgroundColor: band ? band.barColor : '#E5E7EB',
                    }}
                    className={`w-full min-w-[16px] rounded-t-md border-2 border-[#141414] transition-transform cursor-pointer focus-visible:z-20 ${
                      isSelected
                        ? 'ring-2 ring-[#141414] ring-offset-2 ring-offset-[#FFFDF8] -translate-y-1 shadow-[0_3px_0_#141414]'
                        : 'hover:-translate-y-0.5'
                    }`}
                  />
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-1 sm:gap-1.5 mt-2 border-t-2 border-[#141414] pt-2">
            {hourly24.map((point, index) => {
              const showLabel =
                index === 0 || index === hourly24.length - 1 || index % 4 === 0;
              return (
                <div
                  key={point.time}
                  className="flex-1 text-center font-mono text-[11px] font-bold text-[#141414] whitespace-nowrap"
                >
                  {showLabel ? point.hourLabel : ''}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {showDataTable && <HourlyForecastTable hourly24={hourly24} />}

      <p className="mt-3 text-xs sm:text-sm font-semibold text-[#3F3F46]">
        US AQI hourly forecast · modelled estimate, may differ from your exact street
      </p>
    </section>
  );
}
