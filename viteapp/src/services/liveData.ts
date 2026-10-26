/**
 * Live site conditions from free, key-less public APIs:
 *   - Open-Meteo  — current temperature, humidity, wind, solar radiation
 *   - USGS FDSN   — recent earthquakes near the district
 * Both are called straight from the browser (CORS-enabled). The static
 * design values in karnataka_db.ts stay the basis for code calculations;
 * this is the "what's happening right now" layer on top.
 */

/** District HQ coordinates (lat, lon). */
export const DISTRICT_COORDS: Record<string, [number, number]> = {
  'bengaluru-urban': [12.9716, 77.5946],
  'mysuru':          [12.2958, 76.6394],
  'mangaluru':       [12.9141, 74.8560],
  'belagavi':        [15.8497, 74.4977],
  'dharwad':         [15.4589, 75.0078],
  'ballari':         [15.1394, 76.9214],
  'shivamogga':      [13.9299, 75.5681],
  'hassan':          [13.0072, 76.0962],
  'tumakuru':        [13.3379, 77.1173],
  'kalaburagi':      [17.3297, 76.8343],
  'raichur':         [16.2076, 77.3463],
  'bidar':           [17.9104, 77.5199],
  'uttara-kannada':  [14.8136, 74.1295],
  'udupi':           [13.3409, 74.7421],
  'gadag':           [15.4316, 75.6355],
};

export interface LiveWeather {
  time: string;
  temperatureC: number;
  humidityPct: number;
  windKmh: number;
  gustKmh: number;
  windDirDeg: number;
  solarWm2: number;
}

export interface Quake {
  id: string;
  magnitude: number;
  place: string;
  time: number;
  distanceKm: number;
  url: string;
}

export interface LiveConditions {
  weather: LiveWeather | null;
  quakes: Quake[] | null;
  fetchedAt: number;
}

const QUAKE_RADIUS_KM = 500;
const QUAKE_LOOKBACK_DAYS = 365;

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

async function fetchWeather(lat: number, lon: number, signal?: AbortSignal): Promise<LiveWeather> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: 'temperature_2m,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,wind_direction_10m,shortwave_radiation',
    wind_speed_unit: 'kmh',
    timezone: 'auto',
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal });
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  const c = (await res.json()).current;
  return {
    time: c.time,
    temperatureC: c.temperature_2m,
    humidityPct: c.relative_humidity_2m,
    windKmh: c.wind_speed_10m,
    gustKmh: c.wind_gusts_10m,
    windDirDeg: c.wind_direction_10m,
    solarWm2: c.shortwave_radiation,
  };
}

async function fetchQuakes(lat: number, lon: number, signal?: AbortSignal): Promise<Quake[]> {
  const start = new Date(Date.now() - QUAKE_LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10);
  const params = new URLSearchParams({
    format: 'geojson',
    latitude: String(lat),
    longitude: String(lon),
    maxradiuskm: String(QUAKE_RADIUS_KM),
    starttime: start,
    minmagnitude: '2',
    orderby: 'time',
    limit: '20',
  });
  const res = await fetch(`https://earthquake.usgs.gov/fdsnws/event/1/query?${params}`, { signal });
  if (!res.ok) throw new Error(`USGS HTTP ${res.status}`);
  const data = await res.json();
  return (data.features ?? []).map((f: { id: string; properties: { mag: number; place: string; time: number; url: string }; geometry: { coordinates: number[] } }) => ({
    id: f.id,
    magnitude: f.properties.mag,
    place: f.properties.place,
    time: f.properties.time,
    url: f.properties.url,
    distanceKm: Math.round(haversineKm(lat, lon, f.geometry.coordinates[1], f.geometry.coordinates[0])),
  }));
}

/** Fetch both feeds; a failure in one doesn't hide the other. */
export async function fetchLiveConditions(districtId: string, signal?: AbortSignal): Promise<LiveConditions> {
  const coords = DISTRICT_COORDS[districtId] ?? DISTRICT_COORDS['bengaluru-urban'];
  const [weather, quakes] = await Promise.allSettled([
    fetchWeather(coords[0], coords[1], signal),
    fetchQuakes(coords[0], coords[1], signal),
  ]);
  return {
    weather: weather.status === 'fulfilled' ? weather.value : null,
    quakes: quakes.status === 'fulfilled' ? quakes.value : null,
    fetchedAt: Date.now(),
  };
}

export const QUAKE_SEARCH = { radiusKm: QUAKE_RADIUS_KM, days: QUAKE_LOOKBACK_DAYS };
