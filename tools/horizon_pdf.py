"""
Panoramic Horizon Profile PDF Generator
========================================
Generates a POV-style horizon diagram: as if standing at the measurement
station looking outward 360°, seeing terrain silhouette against sky with
sun paths (summer solstice, equinox, winter solstice) and hour markers.

Uses PVGIS 6.0 / NOAA solar position algorithms (same as solarEngine.ts).

Usage:
    python horizon_pdf.py --lat 61.5 --lon 6.8 --name "Stasjon Aurland" --height-offset 3
    python horizon_pdf.py --lat 61.5 --lon 6.8  (minimal)
    python horizon_pdf.py --help
"""

import argparse
import json
import math
import urllib.parse
import urllib.request
from pathlib import Path

from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.colors import Color, HexColor, white
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
PI = math.pi
TWO_PI = 2 * PI
DEG2RAD = PI / 180
RAD2DEG = 180 / PI
SOLAR_CONSTANT = 1360.8

# Kartverket elevation API
KARTVERKET_URL = "https://ws.geonorge.no/hoydedata/v1/punkt"
COORD_SYSTEM = "4258"
MAX_POINTS_PER_REQUEST = 50

# Horizon sampling — max resolution
NUM_DIRECTIONS = 360  # every 1 degree
DIRECTION_INTERVAL_DEG = 360 / NUM_DIRECTIONS
SAMPLE_DISTANCES = [
    5, 10, 15, 20, 25, 30, 40, 50, 60, 75,
    90, 110, 130, 150, 175, 200, 230, 260, 300, 350,
    400, 450, 500, 575, 650, 750, 850, 1000, 1150, 1300,
    1500, 1750, 2000, 2300, 2700, 3100, 3600, 4200, 5000, 6000,
]

# Colours
SKY_TOP = HexColor("#1a2a4a")
SKY_BOTTOM = HexColor("#87CEEB")
TERRAIN_FILL = HexColor("#3d5c3a")
TERRAIN_EDGE = HexColor("#2a3f28")
SUN_SUMMER = HexColor("#f59e0b")
SUN_EQUINOX = HexColor("#ef4444")
SUN_WINTER = HexColor("#3b82f6")
GRID_COLOR = Color(1, 1, 1, 0.25)
GRID_LABEL_COLOR = Color(1, 1, 1, 0.6)
HOUR_DOT_COLOR = Color(1, 1, 1, 0.9)

# ---------------------------------------------------------------------------
# NOAA Solar Position (same as solarEngine.ts)
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

# ---------------------------------------------------------------------------
# Sun path calculation
# ---------------------------------------------------------------------------

def compute_sun_path(doy, lat_deg, lon_deg, tz_hours=1):
    """Return list of (azimuth_deg, altitude_deg, hour) for a given day."""
    lat_rad = lat_deg * DEG2RAD
    points = []
    for h100 in range(0, 2400, 15):  # every 9 minutes for smooth curves
        hour = h100 / 100
        h_int = int(hour)
        m_int = int((hour - h_int) * 60)
        gamma = fractional_year(doy, h_int, 365)
        decl = solar_declination(gamma)
        eq_time = equation_of_time(gamma)
        offset = time_offset(eq_time, lon_deg, tz_hours)
        tst = true_solar_time(h_int, m_int, offset)
        ha = solar_hour_angle(tst)
        zen = solar_zenith(lat_rad, decl, ha)
        alt = solar_altitude(zen)
        if alt <= 0:
            continue
        az = solar_azimuth(lat_rad, decl, zen, ha)
        points.append((az * RAD2DEG, alt * RAD2DEG, hour))
    return points

def compute_hour_markers(doy, lat_deg, lon_deg, tz_hours=1):
    """Return (azimuth_deg, altitude_deg, hour_label) for integer hours."""
    lat_rad = lat_deg * DEG2RAD
    markers = []
    for h in range(0, 24):
        gamma = fractional_year(doy, h, 365)
        decl = solar_declination(gamma)
        eq_time = equation_of_time(gamma)
        offset = time_offset(eq_time, lon_deg, tz_hours)
        tst = true_solar_time(h, 0, offset)
        ha = solar_hour_angle(tst)
        zen = solar_zenith(lat_rad, decl, ha)
        alt = solar_altitude(zen)
        if alt <= 0:
            continue
        az = solar_azimuth(lat_rad, decl, zen, ha)
        markers.append((az * RAD2DEG, alt * RAD2DEG, h))
    return markers

# ---------------------------------------------------------------------------
# Horizon profile from Kartverket
# ---------------------------------------------------------------------------

def meters_to_degree_delta(dist_m, az_rad, lat_deg):
    cos_lat = math.cos(lat_deg * DEG2RAD)
    d_lat = (dist_m * math.cos(az_rad)) / 111320
    d_lon = (dist_m * math.sin(az_rad)) / (111320 * cos_lat)
    return d_lat, d_lon

def fetch_elevations(points):
    """Fetch elevations from Kartverket in chunks."""
    elevations = []
    for i in range(0, len(points), MAX_POINTS_PER_REQUEST):
        chunk = points[i:i + MAX_POINTS_PER_REQUEST]
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
            print(f"  Warning: Kartverket chunk failed: {e}")
            elevations.extend([0] * len(chunk))
    return elevations

def generate_horizon_profile(lat, lon, height_offset=0):
    """Generate horizon profile: returns list of (azimuth_deg, elevation_angle_deg)."""
    print(f"  Fetching terrain data from Kartverket ({NUM_DIRECTIONS} directions, {len(SAMPLE_DISTANCES)} distances)...")

    # Build sample points
    points = [[round(lon, 6), round(lat, 6)]]
    dir_map = [(-1, -1)]

    for d in range(NUM_DIRECTIONS):
        az_deg = d * DIRECTION_INTERVAL_DEG
        az_rad = az_deg * DEG2RAD
        for s, dist in enumerate(SAMPLE_DISTANCES):
            d_lat, d_lon = meters_to_degree_delta(dist, az_rad, lat)
            points.append([round(lon + d_lon, 6), round(lat + d_lat, 6)])
            dir_map.append((d, s))

    total = len(points)
    print(f"  {total} elevation points to query ({math.ceil(total / MAX_POINTS_PER_REQUEST)} API calls)...")
    elevations = fetch_elevations(points)

    if len(elevations) < total:
        elevations.extend([0] * (total - len(elevations)))

    origin_elev = elevations[0] + height_offset
    max_angles = [0.0] * NUM_DIRECTIONS

    for i in range(1, len(dir_map)):
        d_idx, s_idx = dir_map[i]
        if d_idx < 0:
            continue
        elev = elevations[i]
        dh = elev - origin_elev
        dist = SAMPLE_DISTANCES[s_idx]
        angle = math.atan2(dh, dist) * RAD2DEG
        if angle > max_angles[d_idx]:
            max_angles[d_idx] = angle

    # Clamp negatives to 0
    max_angles = [max(0, a) for a in max_angles]

    profile = []
    for d in range(NUM_DIRECTIONS):
        az = d * DIRECTION_INTERVAL_DEG
        profile.append((az, max_angles[d]))

    print(f"  Horizon profile: max elevation {max(max_angles):.1f}°, mean {sum(max_angles)/len(max_angles):.1f}°")
    return profile

# ---------------------------------------------------------------------------
# Panoramic PDF rendering
# ---------------------------------------------------------------------------

def interpolate_horizon(profile, az_deg):
    """Linear interpolation of horizon height at any azimuth."""
    n = len(profile)
    az_deg = az_deg % 360
    for i in range(n):
        a0, h0 = profile[i]
        a1, h1 = profile[(i + 1) % n]
        if a1 < a0:
            a1 += 360
        az_check = az_deg
        if az_check < a0:
            az_check += 360
        if a0 <= az_check <= a1:
            if a1 == a0:
                return h0
            t = (az_check - a0) / (a1 - a0)
            return h0 + t * (h1 - h0)
    return profile[0][1]

def draw_panoramic_pdf(output_path, profile, lat, lon, height_offset, name):
    """Draw the panoramic POV horizon diagram to PDF."""

    page_w, page_h = landscape(A4)
    c = canvas.Canvas(str(output_path), pagesize=landscape(A4))

    # Layout
    margin_left = 30 * mm
    margin_right = 12 * mm
    margin_top = 28 * mm
    margin_bottom = 38 * mm

    chart_x = margin_left
    chart_y = margin_bottom
    chart_w = page_w - margin_left - margin_right
    chart_h = page_h - margin_top - margin_bottom

    # Axis ranges
    az_min, az_max = 0, 360  # full panorama
    max_horizon = max(h for _, h in profile)

    # Compute sun paths to find max altitude
    summer_path = compute_sun_path(172, lat, lon)
    equinox_path = compute_sun_path(80, lat, lon)
    winter_path = compute_sun_path(355, lat, lon)

    max_sun_alt = 0
    for path in [summer_path, equinox_path, winter_path]:
        for _, alt, _ in path:
            if alt > max_sun_alt:
                max_sun_alt = alt

    alt_max = max(max_horizon + 5, max_sun_alt + 5)
    alt_max = math.ceil(alt_max / 5) * 5  # round up to nearest 5
    alt_min = 0

    def az_to_x(az):
        return chart_x + (az - az_min) / (az_max - az_min) * chart_w

    def alt_to_y(alt):
        return chart_y + (alt - alt_min) / (alt_max - alt_min) * chart_h

    # --- Sky gradient background ---
    num_bands = 40
    for i in range(num_bands):
        frac = i / num_bands
        y0 = chart_y + frac * chart_h
        y1 = chart_y + (frac + 1.0 / num_bands) * chart_h
        # Interpolate sky colour (dark blue at top, light blue at horizon)
        r = SKY_TOP.red + (SKY_BOTTOM.red - SKY_TOP.red) * (1 - frac)
        g = SKY_TOP.green + (SKY_BOTTOM.green - SKY_TOP.green) * (1 - frac)
        b = SKY_TOP.blue + (SKY_BOTTOM.blue - SKY_TOP.blue) * (1 - frac)
        c.setFillColor(Color(r, g, b))
        c.rect(chart_x, y0, chart_w, y1 - y0, fill=1, stroke=0)

    # --- Grid lines (altitude) ---
    c.setStrokeColor(GRID_COLOR)
    c.setLineWidth(0.3)
    c.setFont("Helvetica", 7)
    for alt_deg in range(0, int(alt_max) + 1, 5):
        y = alt_to_y(alt_deg)
        if y < chart_y or y > chart_y + chart_h:
            continue
        c.line(chart_x, y, chart_x + chart_w, y)
        c.setFillColor(HexColor("#1e293b"))
        c.drawRightString(chart_x - 4, y - 2, f"{alt_deg}°")

    # --- Grid lines (azimuth) with degree labels ---
    for az in range(0, 361, 15):
        x = az_to_x(az)
        is_major = az % 45 == 0
        c.setStrokeColor(GRID_COLOR)
        c.setLineWidth(0.7 if is_major else 0.25)
        c.line(x, chart_y, x, chart_y + chart_h)

        if is_major:
            c.setFillColor(HexColor("#1e293b"))
            c.setFont("Helvetica-Bold", 8)
            c.drawCentredString(x, chart_y - 12, f"{az}°")

    # --- Sun paths ---
    paths_info = [
        (summer_path, SUN_SUMMER, "Sommarsol (21. juni)", 1.8),
        (equinox_path, SUN_EQUINOX, "Jevndøgn (21. mars)", 1.2),
        (winter_path, SUN_WINTER, "Vintersol (21. des.)", 1.8),
    ]

    for path_pts, color, label, lw in paths_info:
        if not path_pts:
            continue
        c.setStrokeColor(color)
        c.setLineWidth(lw)
        p = c.beginPath()
        started = False
        for az, alt, _ in path_pts:
            x = az_to_x(az)
            y = alt_to_y(alt)
            if not started:
                p.moveTo(x, y)
                started = True
            else:
                p.lineTo(x, y)
        c.drawPath(p, stroke=1, fill=0)

    # --- Hour markers on sun paths ---
    for path_pts, color, label, lw in paths_info:
        markers = compute_hour_markers(
            172 if "juni" in label else (80 if "Jevndøgn" in label else 355),
            lat, lon
        )
        c.setFont("Helvetica-Bold", 6.5)
        for az, alt, hour in markers:
            x = az_to_x(az)
            y = alt_to_y(alt)
            # Dot
            c.setFillColor(color)
            c.circle(x, y, 2.5, fill=1, stroke=0)
            # Hour label
            c.setFillColor(white)
            c.drawCentredString(x, y + 5, f"{hour:02d}")

    # --- Terrain silhouette ---
    # Build a filled polygon: terrain profile + bottom edge
    p = c.beginPath()
    # Start at bottom-left
    p.moveTo(az_to_x(0), chart_y)

    # Smooth terrain line using interpolation at every 0.5 degrees
    for az_10 in range(0, 3601):
        az = az_10 / 10.0
        h = interpolate_horizon(profile, az)
        x = az_to_x(az)
        y = alt_to_y(h)
        p.lineTo(x, y)

    # Close at bottom-right
    p.lineTo(az_to_x(360), chart_y)
    p.close()

    c.setFillColor(Color(TERRAIN_FILL.red, TERRAIN_FILL.green, TERRAIN_FILL.blue, 0.85))
    c.setStrokeColor(TERRAIN_EDGE)
    c.setLineWidth(0.8)
    c.drawPath(p, fill=1, stroke=1)

    # Terrain top edge (bold line for clarity)
    c.setStrokeColor(HexColor("#1a3018"))
    c.setLineWidth(1.2)
    te = c.beginPath()
    for az_10 in range(0, 3601):
        az = az_10 / 10.0
        h = interpolate_horizon(profile, az)
        x = az_to_x(az)
        y = alt_to_y(h)
        if az_10 == 0:
            te.moveTo(x, y)
        else:
            te.lineTo(x, y)
    c.drawPath(te, stroke=1, fill=0)

    # --- Chart border ---
    c.setStrokeColor(Color(1, 1, 1, 0.4))
    c.setLineWidth(0.5)
    c.rect(chart_x, chart_y, chart_w, chart_h, fill=0, stroke=1)

    # --- Title ---
    title = f"Horisontprofil — {name}" if name else "Horisontprofil"
    c.setFillColor(HexColor("#1e293b"))
    c.setFont("Helvetica-Bold", 14)
    c.drawString(chart_x, page_h - 16 * mm, title)

    # Subtitle
    c.setFont("Helvetica", 8.5)
    c.setFillColor(HexColor("#64748b"))
    sub = f"Breiddegrad {lat:.4f}°N, Lengdegrad {lon:.4f}°O"
    if height_offset > 0:
        sub += f" | Hoyde over bakke: {height_offset} m"
    sub += f" | {NUM_DIRECTIONS} retningar, {len(SAMPLE_DISTANCES)} avstandar (Kartverket DTM1)"
    c.drawString(chart_x, page_h - 20 * mm, sub)

    # --- Y-axis label ---
    c.saveState()
    c.setFillColor(HexColor("#475569"))
    c.setFont("Helvetica", 8)
    c.translate(8 * mm, chart_y + chart_h / 2)
    c.rotate(90)
    c.drawCentredString(0, 0, "Horisont-hogde (grader)")
    c.restoreState()

    # --- X-axis label ---
    c.setFillColor(HexColor("#475569"))
    c.setFont("Helvetica", 8)
    c.drawCentredString(chart_x + chart_w / 2, chart_y - 34, "Kompassretning (azimut)")

    # --- Legend (inside chart, top-left, with semi-transparent background box) ---
    legend_items = [
        (SUN_SUMMER, "Sommarsol (21. juni)", False),
        (SUN_EQUINOX, "Jevndøgn (mars/sept.)", False),
        (SUN_WINTER, "Vintersol (21. des.)", False),
        (TERRAIN_FILL, "Terrengprofil", True),
    ]
    legend_padding = 5
    legend_row_h = 12
    legend_item_w = 140
    legend_box_w = legend_item_w + legend_padding * 2
    legend_box_h = len(legend_items) * legend_row_h + legend_padding * 2
    legend_x = chart_x + 8
    legend_y = chart_y + chart_h - legend_box_h - 8

    # Background box
    c.setFillColor(Color(1, 1, 1, 0.75))
    c.setStrokeColor(Color(0, 0, 0, 0.15))
    c.setLineWidth(0.5)
    c.roundRect(legend_x, legend_y, legend_box_w, legend_box_h, 3, fill=1, stroke=1)

    c.setFont("Helvetica", 7.5)
    for i, (color, text, is_rect) in enumerate(legend_items):
        lx = legend_x + legend_padding
        ly = legend_y + legend_box_h - legend_padding - (i + 1) * legend_row_h + 2
        if is_rect:
            c.setFillColor(color)
            c.rect(lx, ly, 14, 7, fill=1, stroke=0)
        else:
            c.setStrokeColor(color)
            c.setLineWidth(1.8)
            c.line(lx, ly + 3, lx + 14, ly + 3)
        c.setFillColor(HexColor("#1e293b"))
        c.drawString(lx + 18, ly, text)

    # --- Footer ---
    c.setFont("Helvetica", 6.5)
    c.setFillColor(HexColor("#94a3b8"))
    c.drawString(chart_x, 6 * mm,
                 "HydroGuide — Solposisjon etter NOAA/PVGIS 6.0  |  Terrengdata: Kartverket DTM1  |  Generert automatisk")

    c.save()
    print(f"\n  PDF saved: {output_path}")

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Generate panoramic horizon profile PDF")
    parser.add_argument("--lat", type=float, required=True, help="Latitude (decimal degrees)")
    parser.add_argument("--lon", type=float, required=True, help="Longitude (decimal degrees)")
    parser.add_argument("--name", type=str, default="", help="Station/location name")
    parser.add_argument("--height-offset", type=float, default=0, help="Height above ground (m)")
    parser.add_argument("--output", type=str, default=None, help="Output PDF path")
    args = parser.parse_args()

    if args.output:
        out = Path(args.output)
    else:
        safe_name = args.name.replace(" ", "_").replace("/", "_") if args.name else f"{args.lat}_{args.lon}"
        out = Path(f"horisontprofil_{safe_name}.pdf")

    print(f"Generating panoramic horizon profile for {args.lat}°N, {args.lon}°E")
    if args.name:
        print(f"  Station: {args.name}")
    if args.height_offset > 0:
        print(f"  Height offset: {args.height_offset} m")

    profile = generate_horizon_profile(args.lat, args.lon, args.height_offset)
    draw_panoramic_pdf(out, profile, args.lat, args.lon, args.height_offset, args.name)

if __name__ == "__main__":
    main()
