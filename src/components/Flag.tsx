import {
  AE, AR, AT, AU, BG, BR, CA, CH, CL, CN, CO, CZ, DE, DK, EG, ES, FI, FR, GB, HK, ID, IE, IN, IT, JP, KR, LU, MX, MY,
  NL, NO, NZ, PE, PH, PL, RO, SA, SE, SG, TH, TR, TW, US, ZA,
} from "country-flag-icons/react/3x2";
import type { FlagComponent } from "country-flag-icons/react/3x2";
import { countryOf } from "../lib/regions";

const FLAGS: Record<string, FlagComponent> = {
  AE, AR, AT, AU, BG, BR, CA, CH, CL, CN, CO, CZ, DE, DK, EG, ES, FI, FR, GB, HK, ID, IE, IN, IT, JP, KR, LU, MX, MY,
  NL, NO, NZ, PE, PH, PL, RO, SA, SE, SG, TH, TR, TW, US, ZA,
};

export function Flag({ code, size = 18 }: { code: string; size?: number }) {
  const country = countryOf(code);
  const Svg = country ? FLAGS[country] : undefined;
  const style = { width: size, height: Math.round((size * 2) / 3) };
  if (!Svg) {
    return (
      <span
        style={style}
        className="inline-grid shrink-0 place-items-center rounded-[2px] bg-s4 text-[7px] font-semibold text-text-3 ring-1 ring-line"
        aria-hidden
      >
        {code.slice(0, 2).toUpperCase()}
      </span>
    );
  }
  return <Svg style={style} className="shrink-0 rounded-[2px] ring-1 ring-black/20" aria-hidden />;
}
