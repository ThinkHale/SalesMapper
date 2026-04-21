#!/usr/bin/env python3
"""
Azure Maps CSV Geocoder
Geocodes addresses from a CSV file using Azure Maps API
"""

import csv
import time
import requests
import sys
from datetime import datetime

# Azure Maps Configuration
SUBSCRIPTION_KEY = '8zaoREb1sCrPeAeKbs8051yFk7WFAB1O8i4CzIpVvLJicQqszva4JQQJ99BKACYeBjFmJl7UAAAgAZMP3wj3'
AZURE_MAPS_URL = 'https://atlas.microsoft.com/search/address/json'
DELAY_MS = 200  # Delay between requests in milliseconds

def build_address(row):
    """
    Build address from CSV row columns J, K, L, M (indices 9, 10, 11, 12)
    J = Street 1, K = Street 2, L = City, M = ZIP
    """
    street1 = row[9].strip() if len(row) > 9 else ''
    street2 = row[10].strip() if len(row) > 10 else ''
    city = row[11].strip() if len(row) > 11 else ''
    zip_code = row[12].strip() if len(row) > 12 else ''
    
    parts = [p for p in [street1, street2, city, zip_code] if p]
    return ', '.join(parts) if parts else None

def geocode_address(address):
    """
    Geocode a single address using Azure Maps
    Returns: (lat, lon, confidence, status)
    """
    if not address:
        return ('', '', '', 'No Address')
    
    params = {
        'api-version': '1.0',
        'subscription-key': SUBSCRIPTION_KEY,
        'query': address,
        'limit': '1'
    }
    
    try:
        response = requests.get(AZURE_MAPS_URL, params=params, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            
            if data.get('results') and len(data['results']) > 0:
                result = data['results'][0]
                position = result.get('position', {})
                lat = position.get('lat', '')
                lon = position.get('lon', '')
                confidence = result.get('score', '')
                
                if lat and lon:
                    return (str(lat), str(lon), str(confidence), 'Success')
            
            return ('', '', '', 'Not Found')
        
        elif response.status_code == 401:
            return ('', '', '', 'Error: Invalid API Key')
        elif response.status_code == 403:
            return ('', '', '', 'Error: Forbidden')
        elif response.status_code == 429:
            return ('', '', '', 'Error: Rate Limit')
        else:
            return ('', '', '', f'Error: HTTP {response.status_code}')
    
    except requests.exceptions.Timeout:
        return ('', '', '', 'Error: Timeout')
    except requests.exceptions.RequestException as e:
        return ('', '', '', f'Error: {str(e)[:50]}')
    except Exception as e:
        return ('', '', '', f'Error: {str(e)[:50]}')

def main():
    # Get input file
    if len(sys.argv) > 1:
        input_file = sys.argv[1]
    else:
        print("Azure Maps CSV Geocoder")
        print("=" * 50)
        input_file = input("Enter CSV file path: ").strip().strip('"')
    
    if not input_file:
        print("Error: No file specified")
        return
    
    # Generate output filename
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    output_file = f'geocoded_{timestamp}.csv'
    
    print(f"\nReading: {input_file}")
    print(f"Output will be saved to: {output_file}")
    print("=" * 50)
    
    try:
        # Read CSV
        with open(input_file, 'r', encoding='utf-8-sig') as f:
            reader = csv.reader(f)
            headers = next(reader)
            rows = list(reader)
        
        total_rows = len(rows)
        print(f"Found {total_rows} rows to process\n")
        
        # Add new columns to headers
        output_headers = headers + ['Latitude', 'Longitude', 'Confidence Score', 'Geocoding Status']
        
        # Process rows
        results = []
        success_count = 0
        error_count = 0
        total_confidence = 0
        
        for i, row in enumerate(rows, 1):
            address = build_address(row)
            
            # Progress indicator
            progress = (i / total_rows) * 100
            print(f"[{i}/{total_rows}] ({progress:.1f}%) Processing: {address or 'No address'}...", end='')
            
            # Geocode
            lat, lon, confidence, status = geocode_address(address)
            
            # Update counters
            if status == 'Success':
                success_count += 1
                if confidence:
                    try:
                        total_confidence += float(confidence)
                    except:
                        pass
            else:
                error_count += 1
            
            # Add geocoding results to row
            result_row = row + [lat, lon, confidence, status]
            results.append(result_row)
            
            print(f" {status}")
            
            # Delay between requests (except last one)
            if i < total_rows:
                time.sleep(DELAY_MS / 1000.0)
        
        # Write output CSV
        print(f"\nWriting results to {output_file}...")
        with open(output_file, 'w', encoding='utf-8', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(output_headers)
            writer.writerows(results)
        
        # Summary
        print("\n" + "=" * 50)
        print("GEOCODING COMPLETE!")
        print("=" * 50)
        print(f"Total rows processed: {total_rows}")
        print(f"Successfully geocoded: {success_count}")
        print(f"Failed: {error_count}")
        
        if success_count > 0:
            avg_confidence = total_confidence / success_count
            print(f"Average confidence: {avg_confidence:.1f}%")
        
        print(f"\nOutput saved to: {output_file}")
        print("=" * 50)
        
    except FileNotFoundError:
        print(f"Error: File '{input_file}' not found")
    except Exception as e:
        print(f"Error: {str(e)}")

if __name__ == '__main__':
    main()
