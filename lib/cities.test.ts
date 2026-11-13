import { cityFromAddress, cityLabel, localityName } from './cities';

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const rosslyn = { suburb: 'Rosslyn', city: 'Arlington', county: 'Arlington County', state: 'Virginia', 'ISO3166-2-lvl4': 'US-VA', country: 'United States', country_code: 'us' };
assert(cityFromAddress(rosslyn) === 'Arlington, VA', 'neighborhoods roll up to their city');
assert(cityFromAddress({ city: 'Washington', 'ISO3166-2-lvl4': 'US-DC', country_code: 'us' }) === 'Washington, DC', 'DC keeps its code');
assert(cityFromAddress({ town: 'Tysons', county: 'Fairfax County', 'ISO3166-2-lvl4': 'US-VA', country_code: 'us' }) === 'Tysons, VA', 'towns count as cities');
assert(cityFromAddress({ county: 'Loudoun County', 'ISO3166-2-lvl4': 'US-VA', country_code: 'us' }) === 'Loudoun County, VA', 'rural spots fall back to the county');
assert(cityFromAddress({ city: 'Paris', state: 'Ile-de-France', country: 'France', country_code: 'fr' }) === 'Paris, France', 'outside the US the country disambiguates');
assert(cityFromAddress({ city: 'Arlington', country_code: 'us' }) === 'Arlington', 'missing state code keeps the bare city');
assert(cityFromAddress({ state: 'Virginia' }) === undefined, 'no locality means no city');
assert(cityFromAddress(undefined) === undefined, 'no address means no city');

assert(localityName({ village: 'Clifton', county: 'Fairfax County' }) === 'Clifton', 'villages are localities');
assert(localityName({ county: 'Fairfax County' }) === undefined, 'counties are not localities');

assert(cityLabel('Arlington, VA') === 'Arlington', 'label drops the region');
assert(cityLabel('Loudoun County, VA') === 'Loudoun County', 'label keeps multi-word names');

console.log('cities tests passed');
