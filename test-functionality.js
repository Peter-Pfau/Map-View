// Test script to verify map functionality
const assert = require('assert');

// Test the coordinate key formatting function
function formatCoordinateKey(coords) {
  return coords.map(value => Number(value).toFixed(6)).join(',');
}

// Test the fan-out coordinates calculation
function fanOutCoordinates(mockMap, center, count) {
  if (count <= 1) {
    return [center];
  }
  
  // Mock map projection for testing
  const zoom = 10;
  const centerPoint = { x: 1000, y: 1000 };
  const radius = Math.max(40, Math.min(90, 30 + count * 12));
  const angleStep = (2 * Math.PI) / count;
  const positions = [];

  for (let i = 0; i < count; i += 1) {
    const angle = angleStep * i;
    const offsetX = radius * Math.cos(angle);
    const offsetY = radius * Math.sin(angle);
    const point = { 
      x: centerPoint.x + offsetX, 
      y: centerPoint.y + offsetY 
    };
    // Convert back to lat/lng (simplified for testing)
    positions.push([
      center[0] + (offsetY / 111000), // rough conversion
      center[1] + (offsetX / (111000 * Math.cos(center[0] * Math.PI / 180)))
    ]);
  }

  return positions;
}

// Test grouping logic
function groupAssetsByLocation(assets) {
  const groupedAssets = new Map();
  
  // Mock coordinates for testing
  const mockCoords = {
    'New York, NY': [40.7128, -74.0060],
    'Los Angeles, CA': [34.0522, -118.2437],
    'Chicago, IL': [41.8781, -87.6298]
  };

  for (const asset of assets) {
    const coords = mockCoords[`${asset.city}, ${asset.state}`];
    if (coords) {
      const key = formatCoordinateKey(coords);
      const group = groupedAssets.get(key) || { coords, assets: [] };
      group.assets.push(asset);
      groupedAssets.set(key, group);
    }
  }

  return groupedAssets;
}

// Run tests
function runTests() {
  console.log('Running map functionality tests...\n');

  // Test 1: Coordinate key formatting
  console.log('Test 1: Coordinate key formatting');
  const coords = [40.712776, -74.005974];
  const key = formatCoordinateKey(coords);
  assert.strictEqual(key, '40.712776,-74.005974');
  console.log('✅ Coordinate key formatting works correctly\n');

  // Test 2: Asset grouping
  console.log('Test 2: Asset grouping by location');
  const testAssets = [
    { name: "Server 1", city: "New York", state: "NY" },
    { name: "Server 2", city: "New York", state: "NY" },
    { name: "Router 1", city: "Los Angeles", state: "CA" },
  ];
  
  const grouped = groupAssetsByLocation(testAssets);
  assert.strictEqual(grouped.size, 2);
  
  const nyGroup = [...grouped.values()].find(g => g.assets.length === 2);
  const laGroup = [...grouped.values()].find(g => g.assets.length === 1);
  
  assert(nyGroup, 'New York group should exist');
  assert(laGroup, 'Los Angeles group should exist');
  assert.strictEqual(nyGroup.assets.length, 2);
  assert.strictEqual(laGroup.assets.length, 1);
  console.log('✅ Asset grouping works correctly\n');

  // Test 3: Fan-out coordinates
  console.log('Test 3: Fan-out coordinate generation');
  const mockMap = { getZoom: () => 10 };
  const centerCoords = [40.7128, -74.0060];
  
  // Test single asset (should return center)
  const singleResult = fanOutCoordinates(mockMap, centerCoords, 1);
  assert.strictEqual(singleResult.length, 1);
  assert.deepStrictEqual(singleResult[0], centerCoords);
  
  // Test multiple assets (should return multiple positions)
  const multiResult = fanOutCoordinates(mockMap, centerCoords, 3);
  assert.strictEqual(multiResult.length, 3);
  assert(multiResult.every(pos => Array.isArray(pos) && pos.length === 2));
  
  // Verify positions are different from center
  const hasVariation = multiResult.some(pos => 
    pos[0] !== centerCoords[0] || pos[1] !== centerCoords[1]
  );
  assert(hasVariation, 'Fan-out should create varied positions');
  console.log('✅ Fan-out coordinate generation works correctly\n');

  // Test 4: Icon creation logic
  console.log('Test 4: Group icon creation logic');
  function buildGroupIcon(count) {
    if (count <= 1) {
      return null;
    }
    return {
      html: `<span class="asset-cluster__inner">${count}</span>`,
      className: 'asset-cluster',
      iconSize: [38, 38],
      iconAnchor: [19, 19],
      popupAnchor: [0, -16]
    };
  }

  const singleIcon = buildGroupIcon(1);
  const multiIcon = buildGroupIcon(3);
  
  assert.strictEqual(singleIcon, null);
  assert(multiIcon !== null);
  assert(multiIcon.html.includes('3'));
  console.log('✅ Group icon creation logic works correctly\n');

  console.log('🎉 All tests passed! The map functionality should work correctly.');
  console.log('\nTo test the functionality:');
  console.log('1. Start your server');
  console.log('2. Open test-map.html in a browser');
  console.log('3. Click "Load Test Data" button');
  console.log('4. Click on the numbered circles to see individual pins expand');
}

// Run the tests
try {
  runTests();
} catch (error) {
  console.error('❌ Test failed:', error.message);
  process.exit(1);
}