# Sales Territory Mapper

A comprehensive web-based mapping tool for sales territory management, built with Azure Maps and Firebase. Upload CSV files containing territory data, create layers, visualize sales zones, and manage your sales team's geographic coverage in real-time.

## Features

### Core Functionality
- **CSV Upload & Parsing**: Upload CSV files with WKT polygons or lat/long coordinates
- **Multiple Layer Support**: Create and manage multiple data layers for different territories
- **Real-Time Editing**: Edit feature properties, territories, and assignments on the fly
- **Firebase Integration**: Store and sync data across your team using Firebase Realtime Database
- **Interactive Map**: Built on Azure Maps with full pan, zoom, and selection capabilities

### Data Support
- **WKT Polygons**: Import territory boundaries, zones, counties, or custom shapes
- **Point Data**: Import locations using latitude/longitude coordinates
- **Flexible Attributes**: Support for custom columns including:
  - Sales territories
  - Business Development Manager (BDM) assignments
  - Sales potential tiers
  - Revenue data
  - Zip codes, counties, states
  - Custom metadata

### Layer Management
- Create unlimited layers for different data sets
- Toggle layer visibility
- Filter and sort features by any attribute
- Export layers back to CSV
- Delete layers or individual features
- Color-coded visualization

### Real-Time Collaboration
- Save your work to Firebase
- Load shared data from Firebase
- Real-time updates across team members
- Persistent data storage

## Getting Started

### Prerequisites
This application runs entirely in the browser. No installation required!

### Using the Application

1. **Open the Application**
   - Visit the GitHub Pages URL (will be available after deployment)
   - The map will initialize automatically

2. **Upload Data**
   - Click "Choose File" to select a CSV file
   - Click "Upload CSV"
   - Enter a name for your layer
   - Your data will be visualized on the map

3. **Manage Layers**
   - Toggle layer visibility with checkboxes
   - Use 🔍 to zoom to a layer
   - Use 📥 to export a layer to CSV
   - Use 🗑️ to delete a layer

4. **Edit Features**
   - Click any feature on the map
   - View its properties in the sidebar
   - Click "Edit Feature" to modify attributes
   - Click "Save Changes" to apply

5. **Filter & Sort**
   - Select a column to filter by
   - Enter a filter value
   - Click "Apply Filter"
   - Use Sort buttons to organize data

6. **Save & Load**
   - Click "Save to Firebase" to persist your work
   - Click "Load from Firebase" to restore saved data
   - Data is accessible by your entire team

## CSV Format

### For Polygon Data (Territories/Zones)
Your CSV should include:
- **WKT column**: Contains Well-Known Text geometry (POLYGON, MULTIPOLYGON)
- **Attribute columns**: Any custom fields (name, territory, BDM, tier, etc.)

Example:
```csv
WKT,Name,Territory,BDM,Tier
"POLYGON((-122.4 37.8, -122.4 37.7, -122.3 37.7, -122.3 37.8, -122.4 37.8))",San Francisco North,West Coast,John Doe,Tier 1
```

### For Point Data (Locations)
Your CSV should include:
- **Latitude column**: Decimal latitude
- **Longitude column**: Decimal longitude
- **Attribute columns**: Any custom fields

Example:
```csv
Latitude,Longitude,Name,Account,Revenue
37.7749,-122.4194,SF Office,Acme Corp,250000
```

### Supported Column Names
The application automatically recognizes these column names (case-insensitive):
- **Geometry**: wkt, geometry, shape, polygon, latitude, longitude, lat, lon
- **Attributes**: name, description, territory, bdm, manager, tier, revenue, zip, county, state

## Technical Details

### Built With
- **Azure Maps**: Interactive mapping and visualization
- **Firebase Realtime Database**: Data storage and synchronization
- **PapaParse**: CSV parsing
- **Wellknown**: WKT geometry parsing
- **Vanilla JavaScript**: No framework dependencies

### Browser Support
- Chrome (recommended)
- Firefox
- Edge
- Safari

### API Keys
The application includes embedded API keys for:
- Azure Maps (subscription key)
- Firebase (configuration)

**Note**: These are development keys. For production use, consider implementing proper key management.

## Deployment to GitHub Pages

This application is configured for GitHub Pages deployment:

1. Ensure all files are committed to your repository
2. Go to repository Settings → Pages
3. Select branch: `main` (or your deployment branch)
4. Select folder: `/ (root)`
5. Click Save
6. Your application will be available at: `https://[username].github.io/SalesMapper/`

## Project Structure

```
SalesMapper/
├── index.html              # Main application HTML
├── css/
│   └── styles.css         # Application styling
├── js/
│   ├── app.js             # Main application logic
│   ├── firebase-config.js # Firebase integration
│   ├── map-manager.js     # Azure Maps management
│   ├── layer-manager.js   # Layer operations
│   └── csv-parser.js      # CSV parsing and export
├── azure_geocoder.py      # Python geocoding tool (legacy)
├── .nojekyll              # GitHub Pages configuration
└── README.md              # This file
```

## Usage Examples

### Example 1: Sales Territory Management
1. Upload CSV with zip code polygons and territory assignments
2. Create separate layers for:
   - Territory boundaries
   - Sales potential tiers
   - Current customer locations
3. Filter by BDM to see individual assignments
4. Edit territories to reassign zip codes

### Example 2: Market Analysis
1. Upload CSV with county-level data
2. Create layers for:
   - Market size by county
   - Competitor presence
   - Target accounts
3. Sort by revenue potential
4. Export prioritized list

### Example 3: Team Coordination
1. Load shared data from Firebase
2. Add new customer locations
3. Update territory assignments
4. Save back to Firebase for team access

## Troubleshooting

### Map not loading
- Check browser console for errors
- Verify Azure Maps subscription key is valid
- Ensure internet connection is active

### CSV upload fails
- Verify CSV has required columns (WKT or Lat/Long)
- Check for proper WKT formatting
- Ensure coordinates are in decimal degrees

### Firebase errors
- Check Firebase configuration
- Verify network connectivity
- Check browser console for specific errors

## Support

For issues or questions:
1. Check the browser console for error messages
2. Verify your CSV format matches the examples
3. Review the troubleshooting section

## License

This project is provided as-is for internal use.

## Credits

Built with Claude AI for sales territory management.

---

**Ready to map your sales success!** 🗺️📈
