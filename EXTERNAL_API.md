# External API Integration Guide

## Overview

SalesMapper provides a powerful External API that allows you to integrate with automation tools like:
- **Microsoft Power Automate**
- **Zapier**
- **Make (Integromat)**
- **IFTTT**
- **Custom webhooks**
- **Browser extensions**

The API is accessible via JavaScript in the browser and can be used to programmatically add, update, and manage locations.

## Quick Start

### Browser Console

You can test the API directly in your browser console:

```javascript
// Add a single location
SalesMapperAPI.addLocation({
    layerId: 'your-layer-id',
    name: 'Store Location',
    latitude: 40.7128,
    longitude: -74.0060,
    properties: {
        address: '123 Main St',
        city: 'New York',
        state: 'NY'
    }
});
```

### Get API Documentation

```javascript
// Get full API documentation
const docs = SalesMapperAPI.getDocumentation();
console.log(docs);
```

## API Reference

### `addLocation(params)`

Add a single location to a layer.

**Parameters:**
- `layerId` (string, required) - ID of the target layer
- `name` (string, optional) - Location name
- `latitude` (number, required) - Latitude coordinate
- `longitude` (number, required) - Longitude coordinate
- `properties` (object, optional) - Additional properties

**Returns:** Promise<{success, data: {featureId, layerId}}>

**Example:**
```javascript
const result = await SalesMapperAPI.addLocation({
    layerId: 'layer_123',
    name: 'Customer Location',
    latitude: 40.7128,
    longitude: -74.0060,
    properties: {
        customerName: 'John Doe',
        accountValue: 50000,
        tier: 'Gold'
    }
});

console.log(result);
// { success: true, data: { featureId: 'feature_456', layerId: 'layer_123' } }
```

### `addLocations(params)`

Add multiple locations to a layer at once.

**Parameters:**
- `layerId` (string, required) - ID of the target layer
- `locations` (array, required) - Array of location objects

**Returns:** Promise<{success, data: {count, layerId}}>

**Example:**
```javascript
const result = await SalesMapperAPI.addLocations({
    layerId: 'layer_123',
    locations: [
        {
            name: 'Store 1',
            latitude: 40.7128,
            longitude: -74.0060,
            properties: { type: 'retail' }
        },
        {
            name: 'Store 2',
            latitude: 34.0522,
            longitude: -118.2437,
            properties: { type: 'warehouse' }
        }
    ]
});

console.log(result);
// { success: true, data: { count: 2, layerId: 'layer_123' } }
```

### `updateLocation(params)`

Update an existing location.

**Parameters:**
- `layerId` (string, required) - ID of the layer
- `featureId` (string, required) - ID of the feature to update
- `properties` (object, required) - Properties to update

**Returns:** Promise<{success, data}>

**Example:**
```javascript
await SalesMapperAPI.updateLocation({
    layerId: 'layer_123',
    featureId: 'feature_456',
    properties: {
        name: 'Updated Name',
        tier: 'Platinum'
    }
});
```

### `deleteLocation(params)`

Delete a location.

**Parameters:**
- `layerId` (string, required) - ID of the layer
- `featureId` (string, required) - ID of the feature to delete

**Returns:** Promise<{success, data}>

**Example:**
```javascript
await SalesMapperAPI.deleteLocation({
    layerId: 'layer_123',
    featureId: 'feature_456'
});
```

### `getLocations(params)`

Get all locations, optionally filtered by layer.

**Parameters:**
- `layerId` (string, optional) - Filter by layer ID

**Returns:** Promise<{success, data: Array<Feature>}>

**Example:**
```javascript
// Get all locations in a specific layer
const result = await SalesMapperAPI.getLocations({
    layerId: 'layer_123'
});

console.log(result.data); // Array of features

// Get all locations across all layers
const allLocations = await SalesMapperAPI.getLocations({});
```

### `createLayer(params)`

Create a new layer.

**Parameters:**
- `name` (string, required) - Layer name
- `type` (string, optional) - Layer type ('point' or 'polygon', default: 'point')
- `features` (array, optional) - Initial features

**Returns:** Promise<{success, data: {layerId}}>

**Example:**
```javascript
const result = await SalesMapperAPI.createLayer({
    name: 'Customer Locations',
    type: 'point',
    features: []
});

const layerId = result.data.layerId;
```

### `getLayers()`

Get all layers.

**Returns:** Promise<{success, data: Array<Layer>}>

**Example:**
```javascript
const result = await SalesMapperAPI.getLayers();

result.data.forEach(layer => {
    console.log(`${layer.name}: ${layer.featureCount} features`);
});
```

### `registerWebhook(event, url, options)`

Register a webhook to receive real-time updates.

**Parameters:**
- `event` (string, required) - Event name to listen for
- `url` (string, required) - Webhook URL
- `options` (object, optional) - Additional options (headers, etc.)

**Returns:** string (webhook ID)

**Example:**
```javascript
const webhookId = SalesMapperAPI.registerWebhook(
    'location.added',
    'https://your-server.com/webhook',
    {
        headers: {
            'Authorization': 'Bearer your-token'
        }
    }
);
```

## Integration Examples

### Microsoft Power Automate

Power Automate can interact with SalesMapper using custom JavaScript actions.

#### Flow Example: Add Location from Excel

1. **Trigger:** When a new row is added to Excel
2. **Action:** HTTP Request to your hosted SalesMapper page
3. **Code:** Execute JavaScript via browser automation

**JavaScript to execute:**
```javascript
// This would be executed in the browser context
(async function() {
    const result = await SalesMapperAPI.addLocation({
        layerId: 'customer-layer',
        name: '@{triggerBody()?[\'CustomerName\']}',
        latitude: parseFloat('@{triggerBody()?[\'Latitude\']}'),
        longitude: parseFloat('@{triggerBody()?[\'Longitude\']}'),
        properties: {
            accountValue: '@{triggerBody()?[\'Value\']}',
            tier: '@{triggerBody()?[\'Tier\']}'
        }
    });

    return result;
})();
```

#### Flow Example: Bulk Import from SharePoint List

```javascript
// Get items from SharePoint
const items = @{body('Get_items')};

// Prepare locations array
const locations = items.map(item => ({
    name: item.Title,
    latitude: parseFloat(item.Latitude),
    longitude: parseFloat(item.Longitude),
    properties: {
        department: item.Department,
        region: item.Region
    }
}));

// Add to SalesMapper
const result = await SalesMapperAPI.addLocations({
    layerId: 'sharepoint-layer',
    locations: locations
});

console.log(`Added ${result.data.count} locations`);
```

### Zapier Integration

Zapier can trigger actions in SalesMapper using webhooks.

#### Zap Example: Google Sheets to SalesMapper

**Trigger:** New row in Google Sheets
**Action:** Webhooks by Zapier (Custom Request)

**Setup:**
1. Use a webhook to call a serverless function
2. The serverless function opens SalesMapper in headless browser
3. Execute the JavaScript API call

**Alternative:** Use Zapier's Code by Zapier (JavaScript)

```javascript
// Zapier JavaScript action
const layerId = inputData.layerId;
const locations = inputData.locations; // Array from previous step

// You would post this to your SalesMapper instance
// via a custom webhook endpoint
output = {
    script: `SalesMapperAPI.addLocations(${JSON.stringify({
        layerId,
        locations
    })})`
};
```

### Custom Webhook Server

Create a simple webhook server that receives data and adds it to SalesMapper:

```javascript
// server.js (Node.js example)
const express = require('express');
const puppeteer = require('puppeteer');
const app = express();

app.post('/add-location', async (req, res) => {
    const { layerId, name, latitude, longitude, properties } = req.body;

    // Launch browser
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    // Navigate to your SalesMapper instance
    await page.goto('https://your-salesmapper-url.com');

    // Execute API call
    const result = await page.evaluate((params) => {
        return SalesMapperAPI.addLocation(params);
    }, { layerId, name, latitude, longitude, properties });

    await browser.close();

    res.json(result);
});

app.listen(3000);
```

### Browser Extension

Create a browser extension that adds locations to SalesMapper:

```javascript
// extension background.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'addLocation') {
        // Find SalesMapper tab
        chrome.tabs.query({ url: '*://your-salesmapper-url.com/*' }, (tabs) => {
            if (tabs.length > 0) {
                // Execute script in SalesMapper tab
                chrome.tabs.executeScript(tabs[0].id, {
                    code: `SalesMapperAPI.addLocation(${JSON.stringify(request.data)})`
                }, (result) => {
                    sendResponse(result);
                });
            }
        });
    }
    return true; // Keep message channel open
});
```

### REST API Wrapper

Create a REST API that wraps the SalesMapper JavaScript API:

```javascript
// api-server.js
const express = require('express');
const { chromium } = require('playwright');
const app = express();

app.use(express.json());

// Keep a browser instance running
let browser, page;

async function initBrowser() {
    browser = await chromium.launch();
    const context = await browser.newContext();
    page = await context.newPage();
    await page.goto('https://your-salesmapper-url.com');
}

initBrowser();

// REST endpoint
app.post('/api/locations', async (req, res) => {
    try {
        const result = await page.evaluate((params) => {
            return SalesMapperAPI.addLocation(params);
        }, req.body);

        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/locations', async (req, res) => {
    const result = await page.evaluate((layerId) => {
        return SalesMapperAPI.getLocations({ layerId });
    }, req.query.layerId);

    res.json(result);
});

app.listen(3000, () => {
    console.log('SalesMapper API Server running on port 3000');
});
```

Now you can call it like a normal REST API:

```bash
# Add location
curl -X POST http://localhost:3000/api/locations \
  -H "Content-Type: application/json" \
  -d '{
    "layerId": "layer_123",
    "name": "New Location",
    "latitude": 40.7128,
    "longitude": -74.0060
  }'

# Get locations
curl http://localhost:3000/api/locations?layerId=layer_123
```

## Events and Webhooks

### Available Events

- `location.added` - A location was added
- `location.updated` - A location was updated
- `location.deleted` - A location was deleted
- `locations.added` - Multiple locations were added
- `layer.created` - A layer was created
- `layer.deleted` - A layer was deleted

### Webhook Payload Format

```json
{
    "event": "location.added",
    "data": {
        "layerId": "layer_123",
        "featureId": "feature_456",
        "name": "Location Name",
        "latitude": 40.7128,
        "longitude": -74.0060
    },
    "timestamp": "2025-12-04T10:30:00.000Z"
}
```

## Security Considerations

1. **Authentication**: For production use, implement API key authentication
2. **CORS**: Configure CORS if accessing from different domains
3. **Rate Limiting**: Implement rate limiting to prevent abuse
4. **Input Validation**: Always validate input data
5. **HTTPS**: Use HTTPS for all API communications
6. **Webhook Verification**: Verify webhook signatures

## Best Practices

1. **Batch Operations**: Use `addLocations()` for multiple locations instead of calling `addLocation()` repeatedly
2. **Error Handling**: Always wrap API calls in try-catch blocks
3. **Layer IDs**: Store layer IDs in your automation tool for reuse
4. **Testing**: Test with small datasets before bulk imports
5. **Monitoring**: Monitor webhook delivery success rates
6. **Logging**: Log all API interactions for debugging

## Troubleshooting

### Common Issues

**Issue:** API not found
```javascript
// Solution: Ensure SalesMapper is fully loaded
if (typeof SalesMapperAPI === 'undefined') {
    console.error('SalesMapper API not loaded yet');
}
```

**Issue:** Layer ID not found
```javascript
// Solution: Get available layers first
const layers = await SalesMapperAPI.getLayers();
console.log('Available layers:', layers.data);
```

**Issue:** Invalid coordinates
```javascript
// Solution: Validate coordinates before sending
function isValidCoordinate(lat, lng) {
    return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}
```

## Support

For API support:
- GitHub Issues: https://github.com/your-org/SalesMapper/issues
- Email: support@salesmapper.com
- Documentation: https://docs.salesmapper.com

## Version

Current API Version: 2.0.0

## License

MIT License - See LICENSE file for details
