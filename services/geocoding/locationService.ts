/**
 * Location Geocoding Service
 * Uses OpenStreetMap Nominatim API (free, no API key required)
 * https://nominatim.org/release-docs/develop/api/Search/
 */

interface LocationSuggestion {
  display_name: string;
  place_id: number;
  lat: string;
  lon: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    suburb?: string;
    postcode?: string;
    state?: string;
    country?: string;
  };
}

interface GeocodeResult {
  name: string;
  fullAddress: string;
  latitude?: number;
  longitude?: number;
}

const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org';

/**
 * Search for locations by name or zip code
 */
export async function searchLocation(query: string): Promise<GeocodeResult[]> {
  if (!query || query.trim().length < 2) {
    return [];
  }

  try {
    // Check if query is a zip code (5 digits for US)
    const isZipCode = /^\d{5}$/.test(query.trim());

    const searchQuery = isZipCode ? `postalcode=${query.trim()}` : `q=${encodeURIComponent(query.trim())}`;

    const url = `${NOMINATIM_BASE_URL}/search?${searchQuery}&format=json&limit=5&addressdetails=1&countrycodes=us`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Pawfectly/1.0', // Required by Nominatim
      },
    });

    if (!response.ok) {
      throw new Error('Geocoding service unavailable');
    }

    const data: LocationSuggestion[] = await response.json();

    return data.map((item) => {
      const address = item.address || {};
      const cityName = address.city || address.town || address.village || address.suburb || '';
      const state = address.state || '';
      const country = address.country || '';
      
      // Format: "City, State" or "City, State, Country"
      let fullAddress = cityName;
      if (state) {
        fullAddress += state ? `, ${state}` : '';
      }
      if (country && country !== 'United States') {
        fullAddress += `, ${country}`;
      }

      // If no city name but we have a display name, use that
      if (!cityName && item.display_name) {
        const parts = item.display_name.split(',');
        fullAddress = parts.slice(0, 2).join(',').trim();
      }

      return {
        name: cityName || item.display_name.split(',')[0],
        fullAddress: fullAddress || item.display_name,
        latitude: item.lat ? parseFloat(item.lat) : undefined,
        longitude: item.lon ? parseFloat(item.lon) : undefined,
      };
    });
  } catch (error) {
    console.error('[LocationService] Error searching location:', error);
    return [];
  }
}

/**
 * Reverse geocode coordinates to get location name
 */
export async function reverseGeocode(lat: number, lon: number): Promise<GeocodeResult | null> {
  try {
    const url = `${NOMINATIM_BASE_URL}/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Pawfectly/1.0',
      },
    });

    if (!response.ok) {
      throw new Error('Reverse geocoding service unavailable');
    }

    const data = await response.json();
    const address = data.address || {};

    const cityName = address.city || address.town || address.village || address.suburb || '';
    const state = address.state || '';
    const country = address.country || '';

    let fullAddress = cityName;
    if (state) {
      fullAddress += `, ${state}`;
    }
    if (country && country !== 'United States') {
      fullAddress += `, ${country}`;
    }

    return {
      name: cityName || data.display_name?.split(',')[0] || '',
      fullAddress: fullAddress || data.display_name || '',
      latitude: lat,
      longitude: lon,
    };
  } catch (error) {
    console.error('[LocationService] Error reverse geocoding:', error);
    return null;
  }
}

