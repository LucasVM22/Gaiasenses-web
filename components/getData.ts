import getOpenMeteo from "./getOpenMeteo";

export type FireSpotsResponseData = {
  city: string;
  count: number;
  events: {
    dist: number;
    lat: number;
    lon: number;
  }[];
  state: string;
};

export type RainfallResponseData = {
  city: string;
  clouds: number;
  lat: number;
  lon: number;
  main: {
    feels_like: number;
    grnd_level: number;
    humidity: number;
    pressure: number;
    temp: number;
  };
  rain: { "1h": number } | {};
  state: string;
  visibility: number;
  weather: {
    description: string;
    icon: string;
    main: string;
  }[];
  wind: {
    deg: number;
    gust: number;
    speed: number;
  };
};

export type LightningResponseData = {
  city: string;
  count: number;
  events: { lat: string; lon: string; dist?: number }[];
  state: string;
};

export type BrightnessResponseData = {
  city: string;
  state: string;
  temp: number;
};

export default async function getData(
  endpoint: string,
  lat: string,
  lon: string,
  dist?: number,
) {
  console.log(
    `https://7ghevyl79d.execute-api.sa-east-1.amazonaws.com/prod/${endpoint}?lat=${lat}&lon=${lon}${
      dist ? `&dist=${dist}` : ""
    }`,
  );
  try {
    const res = await fetch(
      `https://7ghevyl79d.execute-api.sa-east-1.amazonaws.com/prod/${endpoint}?lat=${lat}&lon=${lon}${
        dist ? `&dist=${dist}` : ""
      }`,
      { next: { revalidate: 7200 } },
    );
    // The return value is *not* serialized
    // You can return Date, Map, Set, etc.

    if (!res.ok) {
      //This will activate the closest `error.js` Error Boundary

      if (res.status === 503) {
        console.log(
          `Failed to fetch data from https://satellite-fetcher.up.railway.app/${endpoint}?lat=${lat}&lon=${lon}${
            dist ? `&dist=${dist}` : ""
          } Got status ${res.status}: ${res.statusText}`,
        );
      }
      throw new Error(
        `Failed to fetch data from https://satellite-fetcher.up.railway.app/${endpoint}?lat=${lat}&lon=${lon}${
          dist ? `&dist=${dist}` : ""
        } got status ${res.status}; ${res.statusText}`,
      );
    }
    return res.json();
  } catch (error) {
    console.log(error);
  }
}

export async function getFireSpots(
  lat: string,
  lon: string,
  dist?: number,
): Promise<FireSpotsResponseData> {
  return await getData("fire", lat, lon, dist);
}

async function openWeather(
  lat: string | number,
  lon: string | number,
  lang: string,
): Promise<RainfallResponseData> {
  const part = "minutely,hourly,daily,alerts";

  try {
    const res = await fetch(
      `https://api.openweathermap.org/data/3.0/onecall?lat=${lat}&lon=${lon}&exclude=${part}&appid=${process.env.OPEN_WEATHER_API_KEY}&units=metric&lang=${lang}`,
      { next: { revalidate: 7200 } },
    );

    if (!res.ok) {
      throw new Error(
        `Response from openweather was not ok. Status: ${
          res.status
        } Message: ${await res.text()}`,
      ); // some people throw the response entirely
    }
    const data = await res.json();

    const transformedData = {
      city: "Open Weather API",
      clouds: data.current.clouds,
      lat: data.lat,
      lon: data.lon,
      main: {
        feels_like: data.current.feels_like,
        humidity: data.current.humidity,
        pressure: data.current.pressure,
        temp: data.current.temp,
        grnd_level: 0,
      },
      rain: data.current.rain ? { "1h": data.current.rain["1h"] } : {},
      state: "Open weather API",

      visibility: data.current.visibility,
      weather: data.current.weather,
      wind: {
        deg: data.current.wind_deg,
        gust: data.current.wind_gust,
        speed: data.current.wind_speed,
      },
    };
    return transformedData;
  } catch (error) {
    console.log(error);
    const transformedData = {
      city: "Open Weather API",
      clouds: 30,
      lat: 0,
      lon: 0,
      main: {
        feels_like: 24,
        humidity: 30,
        pressure: 20,
        temp: 24,
        grnd_level: 0,
      },
      rain: {},
      state: "Open weather API",

      visibility: 100,
      weather: [
        {
          description: "indisponível",
          icon: "indisponível",
          main: "indisponível",
        },
      ],
      wind: {
        deg: 90,
        gust: 40,
        speed: 30,
      },
    };
    return transformedData;
  }
}

export async function getWeather(
  lat: string | number,
  lon: string | number,
  options = { lang: "pt_br" },
): Promise<RainfallResponseData> {
  if (options && options.lang === "en") options.lang = "en_us";
  if (options && options.lang === "pt") options.lang = "pt_br";

  //this is the old fetch, using satellite-fetcher API
  //return getData("rainfall", lat, lon);
  //return openWeather(lat, lon, options.lang);
  const resp = await getOpenMeteo({ lat, lon });
  return resp;
}

export async function getLightning(
  lat: string,
  lon: string,
  dist: number,
): Promise<LightningResponseData> {
  try {
    const res = await getData("lightning", lat, lon, dist);
    return res;
  } catch (error) {
    return {
      city: "Test",
      count: 1,
      events: [{ lat: lat, lon: lon, dist: dist }],
      state: "This is mock data in case of server error.",
    };
  }
}

export async function getBrightness(
  lat: string,
  lon: string,
): Promise<BrightnessResponseData> {
  return getData("brightness", lat, lon);
}

export async function reverseGeocode(
  lat: string | number,
  lon: string | number,
): Promise<{
  name: string;
  local_name: any[];
  lat: number;
  lon: number;
  country: string;
  state?: string;
} | null> {
  const url = `http://api.openweathermap.org/geo/1.0/reverse?lat=${lat}&lon=${lon}&limit=${1}&appid=${
    process.env.OPEN_WEATHER_API_KEY
  }`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(
        `Response from reverse geocode was not ok. Status: ${
          res.status
        } Message: ${await res.text()}`,
      ); // some people throw the response entirely
    }

    const data = await res.json();
    return data[0];
  } catch (error) {
    if (error instanceof Error) {
      console.log(error.message);
    }
    return null;
  }
}
