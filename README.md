# Location History Plotter

A web application to visualize your Google Takeout Location History (`Timeline.json`) on an world map.

![Map Preview](backend/template.png)

##  Features

*   **Interactive Visualization**:
    *   **High Performance**: Uses Canvas rendering to handle millions of data points smoothly.
    *   **Customizable**: Adjust dot size, switch map providers (Dark, Light, Satellite, etc.), and toggle between Single Color or Multi-Color (by year) modes.
    *   **Filtering**: View all years at once or filter by specific years.
*   **Automated Workflow**:
    *   **Drag & Drop**: Simple upload interface.
    *   **Download**: One-click download of your map as a PNG.


## Installation & Local Development

1.  **Prerequisites**:
    *   Python 3.8+
    *   pip

2.  **Install Dependencies**:
    ```
    pip install -r requirements.txt
    ```

3.  **Run the Application**:
    ```
    python backend/app.py
    ```

4.  **Access**:
    Open your browser and navigate to `http://127.0.0.1:5000`.

## Usage

1.  **Get your Data**:
    *   Go to [Google Takeout](https://takeout.google.com/).
    *   Deselect all, then select **Location History (Timeline)**.
    *   Download and extract the zip file to find `Timeline.json` (or `Records.json`).
    *   Or if the data is stored on your phone go to location services - timeline - export timeline
2.  **Upload**:
    *   Drag and drop the JSON file onto the web page.
3.  **Explore**:
    *   Wait for the processing to finish (large files may take a moment).
    *   Use the controls to change colors, map styles, and dot sizes.
4.  **Save**:
    *   Click "Download Map" to save a copy to your device.

## Bugs / issues
   * I have only tested with my own takeout data from a Samsung phone.
   * Map providers might not work

