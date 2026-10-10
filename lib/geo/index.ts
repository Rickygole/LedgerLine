import councilDistricts from "./council-districts.json";
import boroughs from "./boroughs.json";

export type GeoBorough = "Manhattan" | "Bronx" | "Brooklyn" | "Queens" | "Staten Island";

export type CouncilDistrictShape = {
  district: number;
  borough: GeoBorough;
  path: string;
  labelX: number;
  labelY: number;
};

export type BoroughShape = {
  borough: GeoBorough;
  path: string;
};

export const GEO_VIEWBOX = "0 0 1000 1000";

export const COUNCIL_DISTRICT_SHAPES = councilDistricts as CouncilDistrictShape[];

export const BOROUGH_SHAPES = boroughs as BoroughShape[];
