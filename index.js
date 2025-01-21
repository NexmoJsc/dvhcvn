const express = require("express");
const fs = require("fs").promises; // For file operations
const path = require("path");
const geolib = require("geolib");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Helper functions
const isPointInBbox = (point, bbox) => {
  if (!point || !bbox) return false;

  const [lng, lat] = point;
  const [west, north, east, south] = bbox;

  return !(lng < west || lng > east || lat < north || lat > south);
};

const isPointInMultiPolygon = (point, coords) => {
  const [longitude, latitude] = point;
  const libPoint = { latitude, longitude };

  for (const c0 of coords) {
    for (const c1 of c0) {
      const libPolygon = c1.map((c2) => ({
        latitude: c2[1],
        longitude: c2[0],
      }));

      if (geolib.isPointInPolygon(libPoint, libPolygon)) return true;
    }
  }

  return false;
};

// API endpoint
app.get("/api/check-location", async (req, res) => {
  const { lat, lng } = req.query;

  if (!lat || !lng) {
    return res
      .status(400)
      .json({ error: "Latitude and longitude are required" });
  }

  const point = [parseFloat(lng), parseFloat(lat)];
  const level1sBboxPath = path.join(
    __dirname,
    "data",
    "gis",
    "level1s_bbox.json"
  );

  try {
    const level1sBbox = JSON.parse(await fs.readFile(level1sBboxPath, "utf8"));

    for (const level1Id of Object.keys(level1sBbox)) {
      const bbox = level1sBbox[level1Id];
      if (!isPointInBbox(point, bbox)) continue;

      const jsonPath = path.join(__dirname, "data", "gis", `${level1Id}.json`);
      const level1Data = JSON.parse(await fs.readFile(jsonPath, "utf8"));

      if (!Array.isArray(level1Data?.level2s)) continue;

      for (const level2 of level1Data.level2s) {
        const coords =
          level2.type === "Polygon" ? [level2.coordinates] : level2.coordinates;

        if (isPointInMultiPolygon(point, coords)) {
          return res.json({
            codeProvince: level1Data.level1_id,
            province: level1Data.name,
            district: level2.name,
            codeDistrict: level2.level2_id,
          });
        }
      }
    }

    return res.json({ province: null, district: null }); // No matching province or district found
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
