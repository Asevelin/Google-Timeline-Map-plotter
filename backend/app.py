import json
import csv
import os
import time
import uuid
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# Use absolute paths to avoid CWD issues
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_FOLDER = os.path.join(BASE_DIR, '../uploads')
PROCESSED_FOLDER = os.path.join(BASE_DIR, '../processed')
FRONTEND_FOLDER = os.path.join(BASE_DIR, '../frontend')
MAP_FOLDER = os.path.join(BASE_DIR, '../map')

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(PROCESSED_FOLDER, exist_ok=True)
os.makedirs(MAP_FOLDER, exist_ok=True)

# Increase max content length for large file uploads (e.g., 500MB)
app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024

def cleanup_old_files():
    """Delete files older than 1 hour to save space."""
    now = time.time()
    cutoff = now - 3600 # 1 hour
    
    for folder in [PROCESSED_FOLDER, MAP_FOLDER, UPLOAD_FOLDER]:
        for filename in os.listdir(folder):
            filepath = os.path.join(folder, filename)
            if os.path.isfile(filepath):
                if os.path.getmtime(filepath) < cutoff:
                    try:
                        os.remove(filepath)
                    except Exception as e:
                        print(f"Error deleting {filepath}: {e}")

def parse_timeline(file_path, unique_id):
    # Load the JSON file
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    segments = data.get('semanticSegments', [])
    
    # structure: { year: [ [date, time, long, lat, accuracy] ] }
    yearly_data = {}

    for segment in segments:
        # Check for timelinePath
        if 'timelinePath' in segment:
            for point in segment['timelinePath']:
                # point format: "lat°, long°"
                # time format: "2013-08-03T05:24:00.000+08:00"
                
                p_str = point.get('point')
                t_str = point.get('time')
                
                if p_str and t_str:
                    try:
                        # Parse Lat/Long
                        lat_str, long_str = p_str.replace('°', '').split(', ')
                        lat = float(lat_str)
                        lon = float(long_str)
                        
                        # Parse Time
                        dt_part = t_str.split('T')
                        date_val = dt_part[0]
                        # Handle time part which might have offset
                        time_val = dt_part[1].split('+')[0].split('Z')[0] 
                        
                        # Year for grouping
                        year = date_val.split('-')[0]
                        
                        if year not in yearly_data:
                            yearly_data[year] = []
                            
                        yearly_data[year].append([date_val, time_val, lon, lat, "0"]) # Accuracy 0 default
                    except Exception as e:
                        # print(f"Error parsing point: {e}")
                        continue

    # Write to CSVs
    generated_files = []
    for year, rows in yearly_data.items():
        filename = f'{unique_id}_{year}.csv'
        csv_path = os.path.join(PROCESSED_FOLDER, filename)
        with open(csv_path, 'w', newline='', encoding='utf-8') as csvfile:
            writer = csv.writer(csvfile)
            writer.writerow(['Date', 'Time', 'Longitude', 'Latitude', 'Accuracy'])
            writer.writerows(rows)
        generated_files.append(filename)
        
    return generated_files

def optimize_timeline_data(data):
    segments = data.get('semanticSegments', [])
    seen_coords = {} # { "YYYY-MM-DD": set("lat,lon") }
    
    for segment in segments:
        if 'timelinePath' in segment:
            new_path = []
            for point in segment['timelinePath']:
                p_str = point.get('point')
                t_str = point.get('time')
                
                if p_str and t_str:
                    try:
                        # Extract date: "2013-08-03T..." -> "2013-08-03"
                        date_val = t_str.split('T')[0]
                        
                        if date_val not in seen_coords:
                            seen_coords[date_val] = set()
                        
                        if p_str in seen_coords[date_val]:
                            continue
                        
                        seen_coords[date_val].add(p_str)
                        new_path.append(point)
                    except:
                        new_path.append(point)
            segment['timelinePath'] = new_path
    return data

@app.route('/')
def index():
    return send_from_directory(FRONTEND_FOLDER, 'index.html')

@app.route('/<path:path>')
def static_files(path):
    return send_from_directory(FRONTEND_FOLDER, path)

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    
    if file:
        # Cleanup old files first
        cleanup_old_files()

        # Generate unique filename
        timestamp = int(time.time())
        ip = request.remote_addr.replace('.', '_').replace(':', '_')
        unique_id = str(uuid.uuid4())[:8]
        filename = f"Timeline_{timestamp}_{ip}_{unique_id}.json"
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        
        # Save directly to disk to avoid memory issues with large files
        try:
            file.save(filepath)
            
            # Optional: Optimize in-place if memory allows
            # We wrap this in a try/except block so if it fails (e.g. OOM), we proceed with the unoptimized file
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    json_data = json.load(f)
                
                json_data = optimize_timeline_data(json_data)
                
                with open(filepath, 'w', encoding='utf-8') as f:
                    json.dump(json_data, f)
            except Exception as e:
                print(f"Optimization skipped due to error (likely memory limit): {e}")
                # Ensure the file is still valid or just use the original saved file
                pass
                
        except Exception as e:
            print(f"File save failed: {e}")
            return jsonify({'error': f"Failed to save file: {str(e)}"}), 500
        
        try:
            years = parse_timeline(filepath, unique_id)
            
            # Remove the JSON file after processing to save space
            if os.path.exists(filepath):
                os.remove(filepath)
            
            # Auto-generate map for all years
            # Name: map + timestamp + ip + uuid
            map_filename = f"map_{timestamp}_{ip}_{unique_id}.png"
            
            # We will now generate the map on the frontend and upload it
            # So we just pass the filename to the frontend
            
            return jsonify({
                'message': 'File processed', 
                'years': years,
                'auto_map': map_filename
            })
        except Exception as e:
            print(e)
            return jsonify({'error': str(e)}), 500

@app.route('/save_map', methods=['POST'])
def save_map():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    file = request.files['file']
    filename = request.form.get('filename')
    
    if not filename:
        return jsonify({'error': 'No filename provided'}), 400
        
    if file:
        filepath = os.path.join(MAP_FOLDER, filename)
        file.save(filepath)
        return jsonify({'message': 'Map saved successfully'})
    
    return jsonify({'error': 'Failed to save map'}), 500

@app.route('/data/<filename>', methods=['GET'])
def get_data(filename):
    return send_from_directory(PROCESSED_FOLDER, filename)

@app.route('/map/<filename>')
def get_map(filename):
    # Serve generated maps
    return send_from_directory(MAP_FOLDER, filename)

if __name__ == '__main__':
    app.run(debug=False, host='0.0.0.0', port=5000)
