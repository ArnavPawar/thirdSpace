/** Address parts Nominatim returns from reverse lookups, and from search when `addressdetails=1` is set. */
export interface NominatimAddress {
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  hamlet?: string;
  county?: string;
  state?: string;
  country?: string;
  country_code?: string;
  'ISO3166-2-lvl4'?: string;
}

export function localityName(address?: NominatimAddress): string | undefined {
  return address?.city || address?.town || address?.village || address?.municipality || address?.hamlet;
}

/**
 * The city a spot counts toward on leaderboards: "Arlington, VA" in the US and "Paris, France" elsewhere,
 * so Arlington, VA and Arlington, TX stay separate.
 */
export function cityFromAddress(address?: NominatimAddress): string | undefined {
  const locality = localityName(address) || address?.county;
  if (!locality) return undefined;
  const region = address?.country_code === 'us'
    ? address['ISO3166-2-lvl4']?.split('-')[1]
    : address?.country;
  return region ? `${locality}, ${region}` : locality;
}

/** "Arlington, VA" -> "Arlington" */
export function cityLabel(city: string): string {
  return city.split(',')[0].trim();
}
