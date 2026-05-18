import { supabase } from "./supabaseClient";

export async function insertSatelliteData({
  name,
  temperature,
  wind_speed,
  humidity,
  lightning_count,
  fire_count,
  date_timeplayed,
  pinnedlocation,
  userlocation,
  timeSpent,
}: {
  name: string;
  temperature: number;
  wind_speed: number;
  humidity: number;
  lightning_count: number;
  fire_count: number;
  date_timeplayed: string;
  pinnedlocation: {
    lat: number;
    lng: number;
  };
  userlocation: {
    userlat: number;
    userlng: number;
  };
  timeSpent: number;
}) {
  const { data, error } = await supabase.from("GaiaLogs").insert([
    {
      name,
      temperature,
      humidity: Math.round(humidity),
      wind_speed,
      lightning_count,
      fireSpots_count: fire_count,
      date_timeplayed,
      pinnedlocation,
      userlocation,
      timeSpent,
    },
  ]);

  if (error) {
    console.error("Erro ao inserir dados no Supabase:", error.message);
    throw error;
  }
  console.log("Dados inseridos com sucesso no Supabase:", data);
  return data;
}
