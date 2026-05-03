"""
Solar Position Time-Series PDF
==============================
Generates a PVGIS-style chart showing altitude, azimuth, incidence angle,
and horizon through the day for a given location/date/panel orientation.

All three metrics in one chart with dual Y-axes:
  Left  axis: Altitude & Incidence (0-90°)
  Right axis: Azimuth (0-360°)

Uses PVGIS 6.0 / NOAA solar position algorithms (same as solarEngine.ts).

Usage:
    python solar_position_pdf.py --lat 60.62 --lon 5.80 --tilt 45 --azimuth 180
    python solar_position_pdf.py --lat 60.62 --lon 5.80 --tilt 45 --azimuth 180 --doy 172 --name "Dalseidmarkåna"
    python solar_position_pdf.py --help
"""

import argparse
import json
import math
import urllib.parse
import urllib.request
from datetime import date, timedelta
from pathlib import Path

from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.colors import Color, HexColor
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
PI = math.pi
TWO_PI = 2 * PI
DEG2RAD = PI / 180
RAD2DEG = 180 / PI

# Kartverket elevation API
KARTVERKET_URL = "https://ws.geonorge.no/hoydedata/v1/punkt"
COORD_SYSTEM = "4258"
MAX_POINTS_PER_REQUEST = 50

NUM_DIRECTIONS = 360
DIRECTION_INTERVAL_DEG = 360 / NUM_DIRECTIONS
SAMPLE_DISTANCES = [
    5, 10, 15, 20, 25, 30, 40, 50, 60, 75,
    90, 110, 130, 150, 175, 200, 230, 260, 300, 350,
    400, 450, 500, 575, 650, 750, 850, 1000, 1150, 1300,
    1500, 1750, 2000, 2300, 2700, 3100, 3600, 4200, 5000, 6000,
]

# Colours
COL_ALTITUDE = HexColor("#10b981")   # emerald
COL_INCIDENCE = HexColor("#f59e0b")  # amber
COL_AZIMUTH = HexColor("#8b5cf6")    # violet
COL_HORIZON = HexColor("#94a3b8")    # slate
COL_SHADE = Color(0.4, 0.45, 0.55, 0.08)
COL_GRID = Color(0.88, 0.91, 0.94, 1)
COL_GRID_MINOR = Color(0.92, 0.94, 0.96, 1)

# ---------------------------------------------------------------------------
# NOAA Solar Position (same as solarEngine.ts / horizon_pdf.py)
# ---------------------------------------------------------------------------

def fractional_year(doy, hour, days_in_year=365):
    return TWO_PI / days_in_year * (doy - 1 + (hour - 12) / 24)

def solar_declination(gamma):
    return (0.006918
            - 0.399912 * math.cos(gamma)
            + 0.070257 * math.sin(gamma)
            - 0.006758 * math.cos(2 * gamma)
            + 0.000907 * math.sin(2 * gamma)
            - 0.002697 * math.cos(3 * gamma)
            + 0.00148 * math.sin(3 * gamma))

def equation_of_time(gamma):
    return 229.18 * (0.000075
                     + 0.001868 * math.cos(gamma)
                     - 0.032077 * math.sin(gamma)
                     - 0.014615 * math.cos(2 * gamma)
                     - 0.04089 * math.sin(2 * gamma))

def time_offset(eq_time, lon_deg, tz_hours):
    return eq_time + 4 * lon_deg - 60 * tz_hours

def true_solar_time(hour, minute, offset_minutes):
    secs = hour * 3600 + minute * 60
    return ((secs + offset_minutes * 60) / 60) % 1440

def solar_hour_angle(tst_minutes):
    return (tst_minutes - 720.0) * (PI / 720.0)

def solar_zenith(lat_rad, decl_rad, ha_rad):
    cos_z = (math.sin(lat_rad) * math.sin(decl_rad)
             + math.cos(lat_rad) * math.cos(decl_rad) * math.cos(ha_rad))
    return math.acos(max(-1, min(1, cos_z)))

def solar_altitude(zenith_rad):
    return PI / 2 - zenith_rad

def solar_azimuth(lat_rad, decl_rad, zenith_rad, ha_rad):
    sin_z = math.sin(zenith_rad)
    if sin_z == 0:
        return 0
    cos_az = ((math.sin(lat_rad) * math.cos(zenith_rad) - math.sin(decl_rad))
              / (math.cos(lat_rad) * sin_z))
    az = math.acos(max(-1, min(1, cos_az)))
    if ha_rad > 0:
        return (PI + az) % TWO_PI
    else:
        return (3 * PI - az) % TWO_PI

def solar_incidence(zenith_rad, azimuth_rad, tilt_rad, orient_rad):
    az_south = azimuth_rad - PI
    ori_south = orient_rad - PI
    frac = az_south / TWO_PI
    if az_south >= 0:
        limited = TWO_PI * (frac - math.floor(frac))
    else:
        limited = TWO_PI - TWO_PI * abs(frac - math.ceil(frac))
    cos_i = (math.cos(zenith_rad) * math.cos(tilt_rad)
             + math.sin(tilt_rad) * math.sin(zenith_rad) * math.cos(limited - ori_south))
    inc = math.acos(max(-1, min(1, cos_i)))
    return max(0, PI / 2 - inc)

# ---------------------------------------------------------------------------
# Horizon profile
# ---------------------------------------------------------------------------

def meters_to_degree_delta(dist_m, az_rad, lat_deg):
    cos_lat = math.cos(lat_deg * DEG2RAD)
    d_lat = (dist_m * math.cos(az_rad)) / 111320
    d_lon = (dist_m * math.sin(az_rad)) / (111320 * cos_lat)
    return d_lat, d_lon

def fetch_elevations(points):
    elevations = []
    total_chunks = math.ceil(len(points) / MAX_POINTS_PER_REQUEST)
    for i in range(0, len(points), MAX_POINTS_PER_REQUEST):
        chunk = points[i:i + MAX_POINTS_PER_REQUEST]
        chunk_num = i // MAX_POINTS_PER_REQUEST + 1
        print(f"    Kartverket API call {chunk_num}/{total_chunks}...", end="\r")
        punkter_json = json.dumps(chunk, separators=(",", ":"))
        params = urllib.parse.urlencode({"koordsys": COORD_SYSTEM, "datakilde": "dtm1", "punkter": punkter_json})
        url = f"{KARTVERKET_URL}?{params}"
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:  # nosec B310
                data = json.loads(resp.read())
                pts = data.get("punkter", data.get("points", data if isinstance(data, list) else []))
                for p in pts:
                    elevations.append(p.get("z", p.get("height", 0)) or 0)
        except Exception as e:
            print(f"\n  Warning: chunk failed: {e}")
            elevations.extend([0] * len(chunk))
    print()
    return elevations

def generate_horizon_profile(lat, lon, height_offset=0):
    print(f"  Generating horizon profile ({NUM_DIRECTIONS} directions × {len(SAMPLE_DISTANCES)} distances)...")
    points = [[round(lon, 6), round(lat, 6)]]
    dir_map = [(-1, -1)]
    for d in range(NUM_DIRECTIONS):
        az_rad = d * DIRECTION_INTERVAL_DEG * DEG2RAD
        for dist in SAMPLE_DISTANCES:
            d_lat, d_lon = meters_to_degree_delta(dist, az_rad, lat)
            points.append([round(lon + d_lon, 6), round(lat + d_lat, 6)])
            dir_map.append((d, SAMPLE_DISTANCES.index(dist)))
    print(f"  {len(points)} points ({math.ceil(len(points) / MAX_POINTS_PER_REQUEST)} API calls)...")
    elevations = fetch_elevations(points)
    if len(elevations) < len(points):
        elevations.extend([0] * (len(points) - len(elevations)))
    origin_elev = elevations[0] + height_offset
    max_angles = [0.0] * NUM_DIRECTIONS
    for i in range(1, len(dir_map)):
        d_idx, s_idx = dir_map[i]
        if d_idx < 0:
            continue
        dh = elevations[i] - origin_elev
        dist = SAMPLE_DISTANCES[s_idx]
        angle = math.atan2(dh, dist) * RAD2DEG
        if angle > max_angles[d_idx]:
            max_angles[d_idx] = angle
    max_angles = [max(0, a) for a in max_angles]
    mean_h = sum(max_angles) / len(max_angles)
    print(f"  Horizon: max {max(max_angles):.1f}°, mean {mean_h:.1f}°")
    return max_angles  # indexed by direction (0=North, 1=1°, ...)

def interpolate_horizon(profile_angles, az_deg):
    az_deg = az_deg % 360
    idx = int(az_deg)
    frac = az_deg - idx
    h0 = profile_angles[idx % 360]
    h1 = profile_angles[(idx + 1) % 360]
    return h0 + frac * (h1 - h0)

# ---------------------------------------------------------------------------
# Compute day data
# ---------------------------------------------------------------------------

def compute_day_data(doy, lat_deg, lon_deg, tilt_rad, orient_rad, horizon_profile):
    lat_rad = lat_deg * DEG2RAD
    points = []
    for h10 in range(0, 241):
        hour = h10 / 10
        h_int = int(hour)
        m_int = round((hour - h_int) * 60)
        gamma = fractional_year(doy, h_int, 365)
        decl = solar_declination(gamma)
        eq_time = equation_of_time(gamma)
        offset = time_offset(eq_time, lon_deg, 1)
        tst = true_solar_time(h_int, m_int, offset)
        ha = solar_hour_angle(tst)
        zen = solar_zenith(lat_rad, decl, ha)
        alt = solar_altitude(zen)
        if alt <= 0:
            continue
        az = solar_azimuth(lat_rad, decl, zen, ha)
        inc = solar_incidence(zen, az, tilt_rad, orient_rad)
        horizon_h = interpolate_horizon(horizon_profile, az * RAD2DEG)
        in_shade = alt * RAD2DEG < horizon_h
        points.append({
            "hour": hour,
            "altitude": alt * RAD2DEG,
            "azimuth": az * RAD2DEG,
            "incidence": inc * RAD2DEG,
            "horizon": horizon_h,
            "in_shade": in_shade,
        })
    return points

# ---------------------------------------------------------------------------
# PDF rendering
# ---------------------------------------------------------------------------

def doy_to_date_str(doy, year=None):
    if year is None:
        year = date.today().year
    d = date(year, 1, 1) + timedelta(days=doy - 1)
    months = ["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des"]
    return f"{d.day}. {months[d.month - 1]} {d.year}"

def draw_pdf(output_path, day_data, lat, lon, tilt_deg, azimuth_deg, doy, name, horizon_profile):
    page_w, page_h = landscape(A4)
    c = canvas.Canvas(str(output_path), pagesize=landscape(A4))

    # Layout — stretch chart to fill the page
    ml = 16 * mm   # left margin (altitude axis)
    mr = 16 * mm   # right margin (azimuth axis)
    mt = 18 * mm   # top
    mb = 16 * mm   # bottom

    chart_x = ml
    chart_y = mb
    chart_w = page_w - ml - mr
    chart_h = page_h - mt - mb

    # Axes
    x_min, x_max = 0, 24
    y_left_min, y_left_max = 0, 90
    y_right_min, y_right_max = 0, 360

    def to_x(h):
        return chart_x + (h - x_min) / (x_max - x_min) * chart_w

    def to_y_left(d):
        return chart_y + (d - y_left_min) / (y_left_max - y_left_min) * chart_h

    def to_y_right(d):
        return chart_y + (d - y_right_min) / (y_right_max - y_right_min) * chart_h

    # --- Title ---
    c.setFont("Helvetica-Bold", 11)
    c.setFillColor(HexColor("#1e293b"))
    title = f"Solposisjon — {name}" if name else "Solposisjon"
    c.drawString(ml, page_h - 10 * mm, title)

    c.setFont("Helvetica", 8)
    c.setFillColor(HexColor("#64748b"))
    subtitle = f"{doy_to_date_str(doy)}  •  {lat:.5f}°N, {lon:.5f}°E  •  Panel: tilt {tilt_deg}°, azimut {azimuth_deg}°"
    c.drawString(ml, page_h - 14.5 * mm, subtitle)

    # --- Chart background ---
    c.setFillColor(HexColor("#f8fafc"))
    c.rect(chart_x, chart_y, chart_w, chart_h, fill=1, stroke=0)

    # --- Shade bands ---
    shade_start = None
    for p in day_data:
        if p["in_shade"] and shade_start is None:
            shade_start = p["hour"]
        if not p["in_shade"] and shade_start is not None:
            x0 = to_x(shade_start)
            x1 = to_x(p["hour"])
            c.setFillColor(COL_SHADE)
            c.rect(x0, chart_y, x1 - x0, chart_h, fill=1, stroke=0)
            shade_start = None
    if shade_start is not None and day_data:
        x0 = to_x(shade_start)
        x1 = to_x(day_data[-1]["hour"])
        c.setFillColor(COL_SHADE)
        c.rect(x0, chart_y, x1 - x0, chart_h, fill=1, stroke=0)

    # --- Left Y grid (0-90°) ---
    c.setFont("Helvetica", 7)
    for d in range(0, 91, 10):
        y = to_y_left(d)
        c.setStrokeColor(COL_GRID if d % 30 == 0 else COL_GRID_MINOR)
        c.setLineWidth(0.6 if d == 0 else 0.3)
        c.line(chart_x, y, chart_x + chart_w, y)
        c.setFillColor(HexColor("#94a3b8"))
        c.drawRightString(chart_x - 4, y - 2, f"{d}°")

    # --- Right Y labels (0-360°) ---
    for d in range(0, 361, 45):
        y = to_y_right(d)
        c.setFillColor(COL_AZIMUTH)
        c.drawString(chart_x + chart_w + 4, y - 2, f"{d}°")

    # --- X grid ---
    for h in range(0, 25):
        if h % 3 != 0:
            continue
        x = to_x(h)
        c.setStrokeColor(COL_GRID)
        c.setLineWidth(0.3)
        c.line(x, chart_y, x, chart_y + chart_h)
        c.setFillColor(HexColor("#64748b"))
        c.setFont("Helvetica", 8)
        c.drawCentredString(x, chart_y - 12, f"{h:02d}:00")

    # --- Axis labels ---
    c.setFont("Helvetica-Bold", 8)
    c.setFillColor(HexColor("#64748b"))
    c.drawRightString(chart_x - 4, chart_y + chart_h + 8, "Høgde / Innfall (°)")
    c.setFillColor(COL_AZIMUTH)
    c.drawString(chart_x + chart_w + 4, chart_y + chart_h + 8, "Azimut (°)")

    # --- Draw lines ---
    def draw_path(data, value_fn, to_y_fn, color, width=1.5, dash=None):
        if not data:
            return
        c.setStrokeColor(color)
        c.setLineWidth(width)
        if dash:
            c.setDash(*dash)
        else:
            c.setDash([])
        p = c.beginPath()
        first = True
        for pt in data:
            x = to_x(pt["hour"])
            y = to_y_fn(value_fn(pt))
            if first:
                p.moveTo(x, y)
                first = False
            else:
                p.lineTo(x, y)
        c.drawPath(p, fill=0, stroke=1)
        c.setDash([])

    # Horizon (dashed, left axis)
    draw_path(day_data, lambda p: p["horizon"], to_y_left, COL_HORIZON, width=1.0, dash=([3, 2], 0))

    # Azimuth (right axis)
    draw_path(day_data, lambda p: p["azimuth"], to_y_right, COL_AZIMUTH, width=2.0)

    # Incidence (left axis)
    draw_path(day_data, lambda p: p["incidence"], to_y_left, COL_INCIDENCE, width=2.0)

    # Altitude (left axis)
    draw_path(day_data, lambda p: p["altitude"], to_y_left, COL_ALTITUDE, width=2.5)

    # --- Chart border ---
    c.setStrokeColor(HexColor("#e2e8f0"))
    c.setLineWidth(0.5)
    c.rect(chart_x, chart_y, chart_w, chart_h, fill=0, stroke=1)

    # --- Legend ---
    legend_y = 6 * mm
    legend_x = ml
    items = [
        (COL_ALTITUDE, "Solhøgde", False),
        (COL_INCIDENCE, "Innfallsvinkel (NA)", False),
        (COL_AZIMUTH, "Azimut", False),
        (COL_HORIZON, "Horisont", True),
    ]
    c.setFont("Helvetica", 8)
    for color, label, dashed in items:
        c.setStrokeColor(color)
        c.setLineWidth(2 if not dashed else 1)
        if dashed:
            c.setDash([3, 2], 0)
        else:
            c.setDash([])
        c.line(legend_x, legend_y + 3, legend_x + 14, legend_y + 3)
        c.setDash([])
        c.setFillColor(HexColor("#475569"))
        c.drawString(legend_x + 18, legend_y, label)
        legend_x += c.stringWidth(label, "Helvetica", 8) + 30

    # Shade indicator
    c.setFillColor(COL_SHADE)
    c.rect(legend_x, legend_y, 12, 8, fill=1, stroke=0)
    c.setFillColor(HexColor("#475569"))
    c.drawString(legend_x + 16, legend_y, "I skugge")

    # --- Footer ---
    c.setFont("Helvetica", 5)
    c.setFillColor(HexColor("#94a3b8"))
    c.drawString(ml, 2 * mm, "HydroGuide  •  NOAA/PVGIS 6.0  •  Kartverket DTM1")

    c.save()
    print(f"\n  PDF saved: {output_path}")

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Solar Position Time-Series PDF (PVGIS-style)")
    parser.add_argument("--lat", type=float, required=True, help="Latitude (decimal degrees)")
    parser.add_argument("--lon", type=float, required=True, help="Longitude (decimal degrees)")
    parser.add_argument("--tilt", type=float, default=45, help="Panel tilt (degrees, default 45)")
    parser.add_argument("--azimuth", type=float, default=180, help="Panel azimuth (degrees from N, default 180=south)")
    parser.add_argument("--doy", type=int, default=None, help="Day of year (1-365, default=today)")
    parser.add_argument("--date", type=str, default=None, help="Date as YYYY-MM-DD (alternative to --doy)")
    parser.add_argument("--name", type=str, default="", help="Location name")
    parser.add_argument("--height-offset", type=float, default=0, help="Height offset above terrain (m)")
    parser.add_argument("--output", type=str, default=None, help="Output PDF path")
    args = parser.parse_args()

    # Resolve day-of-year
    if args.date:
        d = date.fromisoformat(args.date)
        doy = d.timetuple().tm_yday
    elif args.doy:
        doy = args.doy
    else:
        doy = date.today().timetuple().tm_yday

    tilt_rad = args.tilt * DEG2RAD
    orient_rad = args.azimuth * DEG2RAD

    print("\nSolar Position PDF")
    print(f"  Location: {args.lat:.5f}°N, {args.lon:.5f}°E")
    print(f"  Date: day {doy} ({doy_to_date_str(doy)})")
    print(f"  Panel: tilt {args.tilt}°, azimut {args.azimuth}°")
    print()

    # Generate horizon profile
    horizon = generate_horizon_profile(args.lat, args.lon, args.height_offset)

    # Compute day data
    print("  Computing solar positions...")
    day_data = compute_day_data(doy, args.lat, args.lon, tilt_rad, orient_rad, horizon)
    print(f"  {len(day_data)} data points (sun above horizon)")

    if day_data:
        max_alt = max(p["altitude"] for p in day_data)
        max_inc = max(p["incidence"] for p in day_data)
        print(f"  Max altitude: {max_alt:.1f}°, max incidence: {max_inc:.1f}°")

    # Output path
    if args.output:
        out = Path(args.output)
    else:
        safe_name = args.name.replace(" ", "_") if args.name else f"{args.lat:.2f}_{args.lon:.2f}"
        out = Path(f"solar_position_{safe_name}_dag{doy}.pdf")

    draw_pdf(out, day_data, args.lat, args.lon, args.tilt, args.azimuth, doy, args.name, horizon)

if __name__ == "__main__":
    main()
