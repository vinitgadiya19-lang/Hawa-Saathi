import {
  TRAVEL_MODE_FACTORS,
  TRAVEL_MODE_ORDER,
} from '../../config/emissionFactors';

export function MethodologyPanel() {
  return (
    <div className="rounded-2xl border-2 border-[#141414] bg-[#FFFDF2] p-4 sm:p-5 space-y-4">
      <div>
        <h3 className="font-serif text-lg font-bold text-[#141414]">
          How we calculate estimates
        </h3>
        <p className="text-sm font-medium text-[#262626] mt-1">
          Every figure is an <strong>estimate</strong>, not a measured health outcome.
          Per-trip exposure score ={' '}
          <span className="font-mono font-bold">
            Slot AQI × Trip Minutes × Mode PM2.5 Factor × Vulnerability Factor
          </span>
          .
        </p>
      </div>

      <div className="overflow-x-auto overflow-y-hidden overscroll-x-contain">
        <table className="w-full text-left border-collapse min-w-[600px] text-xs sm:text-sm">
          <thead>
            <tr className="border-b-2 border-[#141414] bg-[#FFF3B0] font-extrabold text-[#141414]">
              <th scope="col" className="p-2.5">Travel Mode</th>
              <th scope="col" className="p-2.5">Est. g CO2 / pkm</th>
              <th scope="col" className="p-2.5">PM2.5 Weight</th>
              <th scope="col" className="p-2.5">Assumed Speed</th>
              <th scope="col" className="p-2.5">Source / Basis</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#141414]/15 font-medium text-[#141414]">
            {TRAVEL_MODE_ORDER.map((modeId) => {
              const f = TRAVEL_MODE_FACTORS[modeId];
              return (
                <tr key={modeId}>
                  <td className="p-2.5 font-bold">{f.label}</td>
                  <td className="p-2.5 font-mono tabular-nums">
                    {f.co2GramsPerPassengerKm} g
                  </td>
                  <td className="p-2.5 font-mono tabular-nums">
                    {f.pm25ExposureFactor.toFixed(2)}×
                  </td>
                  <td className="p-2.5 font-mono tabular-nums">
                    {f.avgSpeedKmh} km/h
                  </td>
                  <td className="p-2.5 text-xs text-[#3F3F46]">{f.source}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs sm:text-sm">
        <div className="rounded-xl border border-[#141414]/25 bg-white p-3">
          <div className="font-extrabold text-[#141414] mb-1">
            Vulnerability multipliers (estimate)
          </div>
          <ul className="space-y-1 text-[#262626]">
            <li>
              Child (&lt;12): <strong>1.35×</strong> · Senior (60+):{' '}
              <strong>1.35×</strong> · Teen: <strong>1.10×</strong> · Adult:{' '}
              <strong>1.00×</strong>
            </li>
            <li>
              Asthma: <strong>1.40×</strong> · Heart condition: <strong>1.35×</strong> ·
              Pregnancy: <strong>1.35×</strong>
            </li>
          </ul>
        </div>
        <div className="rounded-xl border border-[#141414]/25 bg-white p-3">
          <div className="font-extrabold text-[#141414] mb-1">
            Weekly cooking fuel baseline (estimate)
          </div>
          <ul className="space-y-1 text-[#262626]">
            <li>
              LPG: <strong>10.1 kg CO2/wk</strong> · PNG: <strong>8.6 kg/wk</strong> ·
              Induction: <strong>6.4 kg/wk</strong> · Biomass:{' '}
              <strong>24.0 kg/wk</strong>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
