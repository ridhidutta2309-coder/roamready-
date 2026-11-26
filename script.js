const cityForm = document.getElementById("cityForm");
const cityInput = document.getElementById("cityInput");
const destinationList = document.getElementById("destinationList");
const cityCount = document.getElementById("cityCount");
const statusBox = document.getElementById("status");
const weatherPanel = document.getElementById("weatherPanel");

let destinations = [];
let selectedId = null;
let nextId = 1;

const weatherTypes = [
  {test: c => c === 0 || c === 1, label:"Sunny / clear", icon:"☀️"},
  {test: c => c === 2 || c === 3, label:"Cloudy", icon:"☁️"},
  {test: c => [45,48].includes(c), label:"Foggy", icon:"🌫️"},
  {test: c => [51,53,55,61,63,65,80,81,82].includes(c), label:"Light rain / showers", icon:"🌦️"},
  {test: c => [95,96,99].includes(c), label:"Thunderstorm", icon:"⛈️"},
  {test: c => [71,73,75,77,85,86].includes(c), label:"Snowy / cold", icon:"❄️"}
];
function conditionFor(code, wind) {
  if (wind >= 35) return {label:"Windy",icon:"💨"};
  return weatherTypes.find(item => item.test(code)) || {label:"Changeable",icon:"🌤️"};
}
function dateLabel(date) {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric"});
}
function setStatus(message, isError=false) {
  statusBox.textContent = message;
  statusBox.classList.toggle("error",isError);
}
function renderDestinations() {
  cityCount.textContent = `${destinations.length} destination${destinations.length===1?"":"s"}`;
  if (!destinations.length) {
    destinationList.innerHTML = '<span class="empty-destinations">Your added destinations will appear here.</span>';
    weatherPanel.classList.add("hidden");
    return;
  }
  destinationList.innerHTML = destinations.map(d => `
    <button class="destination-chip ${d.id===selectedId?"active":""}" data-select="${d.id}" type="button">
      <span>⌖</span>${escapeHtml(d.name)}
      <span class="remove" data-remove="${d.id}" role="button" aria-label="Remove ${escapeHtml(d.name)}" title="Remove destination">×</span>
    </button>`).join("");
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
}
destinationList.addEventListener("click", async event => {
  const removeButton = event.target.closest("[data-remove]");
  if (removeButton) {
    event.stopPropagation();
    const id = Number(removeButton.dataset.remove);
    destinations = destinations.filter(d => d.id !== id);
    if (selectedId === id) {
      selectedId = null;
      weatherPanel.classList.add("hidden");
      if (destinations.length) await selectDestination(destinations[0].id);
    }
    renderDestinations();
    return;
  }
  const chip = event.target.closest("[data-select]");
  if (chip) await selectDestination(Number(chip.dataset.select));
});
cityForm.addEventListener("submit", async event => {
  event.preventDefault();
  const query = cityInput.value.trim();
  if (!query) return;
  setStatus("Searching for your destination…");
  document.getElementById("addCityBtn").disabled = true;
  try {
    const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=en&format=json`);
    if (!response.ok) throw new Error("Destination search is unavailable. Please try again.");
    const data = await response.json();
    if (!data.results?.length) throw new Error("City not found. Try a different spelling or a nearby major city.");
    const place = data.results[0];
    const duplicate = destinations.find(d => d.name.toLowerCase() === place.name.toLowerCase() && d.country === (place.country || ""));
    if (duplicate) {
      cityInput.value = "";
      setStatus("That destination is already in your itinerary.");
      await selectDestination(duplicate.id);
      return;
    }
    const destination = {id:nextId++,name:place.name,country:place.country || "",admin:place.admin1 || "",latitude:place.latitude,longitude:place.longitude};
    destinations.push(destination);
    cityInput.value = "";
    selectedId = destination.id;
    renderDestinations();
    await loadForecast(destination);
  } catch(error) {
    setStatus(error.message || "Something went wrong.",true);
  } finally {
    document.getElementById("addCityBtn").disabled = false;
  }
});
async function selectDestination(id) {
  const destination = destinations.find(d => d.id === id);
  if (!destination) return;
  selectedId = id;
  renderDestinations();
  await loadForecast(destination);
}
async function loadForecast(place) {
  setStatus(`Loading the five-day forecast for ${place.name}…`);
  weatherPanel.classList.add("hidden");
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max&hourly=relative_humidity_2m&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code&timezone=auto&forecast_days=5`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("Weather data is unavailable right now. Please try again.");
    const data = await response.json();
    renderForecast(place,data);
    setStatus("");
    weatherPanel.classList.remove("hidden");
    weatherPanel.scrollIntoView({behavior:"smooth",block:"start"});
  } catch(error) {
    setStatus(error.message || "Could not load weather data.",true);
  }
}
function renderForecast(place,data) {
  const daily = data.daily;
  const todayCode = data.current.weather_code;
  const currentCondition = conditionFor(todayCode,data.current.wind_speed_10m || 0);
  const highs = daily.temperature_2m_max;
  const lows = daily.temperature_2m_min;
  const swings = highs.map((high,i)=>Math.round(high-lows[i]));
  const firstHumidity = data.current.relative_humidity_2m ?? 0;
  const firstRain = daily.precipitation_probability_max[0] ?? 0;
  const avgToday = Math.round((highs[0]+lows[0])/2);
  const firstCondition = conditionFor(daily.weather_code[0],daily.wind_speed_10m_max[0] || 0);

  document.getElementById("selectedCity").textContent = place.name;
  document.getElementById("selectedRegion").textContent = [place.admin,place.country].filter(Boolean).join(", ") || "Selected destination";
  document.getElementById("currentIcon").textContent = currentCondition.icon;
  document.getElementById("currentCondition").textContent = currentCondition.label;
  document.getElementById("currentTemp").textContent = Math.round(data.current.apparent_temperature ?? data.current.temperature_2m);
  document.getElementById("summaryLine").textContent = `Feels like now · ${firstCondition.label} expected today`;
  document.getElementById("todayHigh").textContent = `${Math.round(highs[0])}°C`;
  document.getElementById("todayLow").textContent = `${Math.round(lows[0])}°C`;
  document.getElementById("todayHumidity").textContent = `${firstHumidity}%`;
  document.getElementById("todayRain").textContent = `${firstRain}%`;

  const allTemps = [...highs,...lows];
  const minAll = Math.min(...allTemps), maxAll = Math.max(...allTemps);
  const range = Math.max(1,maxAll-minAll);
  document.getElementById("forecastGrid").innerHTML = daily.time.map((date,i)=>{
    const condition = conditionFor(daily.weather_code[i],daily.wind_speed_10m_max[i] || 0);
    const high = Math.round(highs[i]), low = Math.round(lows[i]);
    const humidity = i===0 ? firstHumidity : estimateHumidity(data,i);
    const rain = daily.precipitation_probability_max[i] ?? 0;
    const width = Math.max(12,((high-low)/range)*100);
    return `<article class="day-card">
      <div class="day-top"><b>${dateLabel(date)}</b><span>${condition.icon}</span></div>
      <div class="day-condition">${condition.label}</div>
      <div class="day-temps"><strong>${high}°</strong><span>${low}° low</span></div>
      <div class="temp-range"><span style="width:${width}%"></span></div>
      <div class="day-detail"><span>Humidity</span><b>${humidity}%</b></div>
      <div class="day-detail"><span>Rain chance</span><b>${rain}%</b></div>
    </article>`;
  }).join("");

  const maxSwing = Math.max(...swings);
  const swingIndex = swings.indexOf(maxSwing);
  const swingAlert = document.getElementById("swingAlert");
  const swingTag = document.getElementById("swingTag");
  if (maxSwing >= 10) {
    swingAlert.classList.add("wide-swing");
    swingTag.classList.add("wide");
    swingTag.textContent = "WIDE SWING";
    document.getElementById("swingText").textContent = `${dateLabel(daily.time[swingIndex])} has a ${maxSwing}°C day-to-night difference (${Math.round(highs[swingIndex])}°C daytime high and ${Math.round(lows[swingIndex])}°C nighttime low). Pack layers for the evening.`;
  } else {
    swingAlert.classList.remove("wide-swing");
    swingTag.classList.remove("wide");
    swingTag.textContent = "MODERATE";
    document.getElementById("swingText").textContent = `The largest day-to-night change is ${maxSwing}°C on ${dateLabel(daily.time[swingIndex])}. A light extra layer should be enough for most travellers.`;
  }
  renderAdvice(highs,lows,daily.precipitation_probability_max,daily.weather_code,daily.wind_speed_10m_max);
}
function estimateHumidity(data,index) {
  // Open-Meteo hourly humidity is available client-side; use the mean of each local day's hourly values.
  const hours = data.hourly;
  const date = data.daily.time[index];
  if (!hours?.time || !hours.relative_humidity_2m) return data.current.relative_humidity_2m ?? 0;
  const values = hours.time.map((t,i)=>t.startsWith(date)?hours.relative_humidity_2m[i]:null).filter(v=>v!==null);
  return values.length ? Math.round(values.reduce((a,b)=>a+b,0)/values.length) : (data.current.relative_humidity_2m ?? 0);
}
function renderAdvice(highs,lows,rains,codes,winds) {
  const coldestLow = Math.min(...lows);
  const warmestHigh = Math.max(...highs);
  const maxRain = Math.max(...rains.map(v=>v??0));
  const maxWind = Math.max(...winds.map(v=>v??0));
  const widestSwing = Math.max(...highs.map((v,i)=>v-lows[i]));
  const items = new Set();
  let title, advice;
  if (coldestLow <= 5) {
    title = "Cold nights ahead — pack warm layers";
    advice = `Nighttime temperatures may fall to ${Math.round(coldestLow)}°C. Pack a warm sweater, insulated jacket, thermal innerwear and closed shoes.`;
    ["Warm sweater","Insulated jacket","Thermal innerwear","Warm socks","Closed shoes"].forEach(x=>items.add(x));
  } else if (coldestLow <= 14) {
    title = "Chilly evenings — bring an extra layer";
    advice = `Evenings may cool down to ${Math.round(coldestLow)}°C. Pack a light woollen sweater and a windbreaker jacket, especially for outdoor plans.`;
    ["Light woollen sweater","Windbreaker jacket","Full-length trousers","Comfortable shoes"].forEach(x=>items.add(x));
  } else if (warmestHigh >= 29) {
    title = "Warm days — choose breathable clothing";
    advice = `Daytime temperatures may reach ${Math.round(warmestHigh)}°C. Choose light cotton or linen outfits, sunglasses and sun protection.`;
    ["Cotton / linen outfits","Sunglasses","Cap or hat","Sunscreen"].forEach(x=>items.add(x));
  } else {
    title = "Comfortable weather — pack versatile layers";
    advice = `Temperatures range from ${Math.round(coldestLow)}°C at night to ${Math.round(warmestHigh)}°C during the day. Pack versatile outfits and one light layer.`;
    ["T-shirts or shirts","Light cardigan","Comfortable trousers","Walking shoes"].forEach(x=>items.add(x));
  }
  if (maxRain >= 40) {
    advice += ` Rain probability reaches ${maxRain}% on at least one forecast day, so carry a compact umbrella or rain jacket.`;
    ["Compact umbrella","Rain jacket"].forEach(x=>items.add(x));
  }
  if (maxWind >= 30) {
    advice += " Stronger winds are possible; a wind-resistant outer layer will be useful.";
    items.add("Wind-resistant layer");
  }
  if (widestSwing >= 10) {
    advice += ` The day-to-night temperature swing reaches ${Math.round(widestSwing)}°C, so avoid relying on a single outfit layer.`;
  }
  document.getElementById("adviceTitle").textContent = title;
  document.getElementById("adviceText").textContent = advice;
  document.getElementById("packingItems").innerHTML = [...items].map(item=>`<span>✓ ${item}</span>`).join("");
}
