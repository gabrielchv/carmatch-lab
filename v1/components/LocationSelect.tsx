"use client";

import { useEffect, useMemo, useState } from "react";
import SearchableSelect, { type SelectOption } from "@/components/SearchableSelect";
import localitiesData from "@/lib/brazil-localities.json";
import { parseLocalization } from "@/lib/location-utils";

interface BrazilState {
  name: string;
  cities: string[];
}

type LocalitiesMap = Record<string, BrazilState>;

const localities = localitiesData as LocalitiesMap;

const STATE_OPTIONS: SelectOption[] = Object.entries(localities)
  .map(([code, data]) => ({
    value: code,
    label: `${data.name} (${code})`,
  }))
  .sort((a, b) => a.label.localeCompare(b.label));

function formatLocalization(state: string, city: string): string {
  if (city && state) return `${city}, ${state}`;
  if (state) return state;
  return "";
}

interface LocationSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

export default function LocationSelect({
  label,
  value,
  onChange,
}: LocationSelectProps) {
  const parsed = useMemo(() => parseLocalization(value), [value]);
  const [selectedState, setSelectedState] = useState(parsed.state);
  const [selectedCity, setSelectedCity] = useState(parsed.city);

  // Sync internal state when external value changes
  useEffect(() => {
    setSelectedState(parsed.state);
    setSelectedCity(parsed.city);
  }, [parsed.state, parsed.city]);

  const cityOptions: SelectOption[] = useMemo(() => {
    if (!selectedState || !localities[selectedState]) return [];
    return localities[selectedState].cities.map((city) => ({
      value: city,
      label: city,
    }));
  }, [selectedState]);

  const handleStateChange = (opt: SelectOption | null) => {
    const newState = opt?.value || "";
    setSelectedState(newState);
    setSelectedCity("");
    onChange(formatLocalization(newState, ""));
  };

  const handleCityChange = (opt: SelectOption | null) => {
    const newCity = opt?.value || "";
    setSelectedCity(newCity);
    onChange(formatLocalization(selectedState, newCity));
  };

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium mb-1">{label}</label>

      {/* State select */}
      <select
        value={selectedState}
        onChange={(e) => {
          const newState = e.target.value;
          setSelectedState(newState);
          setSelectedCity("");
          onChange(formatLocalization(newState, ""));
        }}
        className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500 bg-white"
      >
        <option value="">Todos os estados</option>
        {STATE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {/* City select (only enabled if state selected) */}
      <SearchableSelect
        label=""
        placeholder={selectedState ? "Selecione a cidade..." : "Selecione um estado primeiro"}
        value={selectedCity}
        options={cityOptions}
        onChange={handleCityChange}
        disabled={!selectedState}
      />
    </div>
  );
}
