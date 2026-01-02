import os

import re

import time

import pandas as pd

from watchdog.observers import Observer

from watchdog.events import FileSystemEventHandler



# --- CONFIGURATION ---

WATCH_PATH = os.path.expanduser("~/Desktop/ZMD_Data")

NOISE_WORDS = [

    'CRASH', 'DCP ID E ZIPPED', 'IO$PAK', 'IOIPPORT', 'IOPAK', 

    'LAST MQTT', 'MQTT', 'IO$IPPORT', 'AWS', 'PARTINER', 

    'SOLAR', 'WIND', 'BUSTCPSERVER', '(JOB)', 'TABLEHOUR', 

    'TABLESYNOP', 'TABLE', 'LOG', 'SYNOP'

]



class StationHandler(FileSystemEventHandler):

    def on_modified(self, event):

        if not event.is_directory:

            self.process_all_files()



    def clean_station_name(self, filename):

        name = os.path.splitext(filename)[0].upper()

        # Remove noise keywords

        pattern = '|'.join([re.escape(word) for word in NOISE_WORDS])

        name = re.split(pattern, name)[0]

        # Remove numbers NOT at the start

        name = re.sub(r'(?<=[A-Z_\s])\d+', '', name)

        return name.replace('_', ' ').strip()



    def process_all_files(self):

        station_data = {}

        now = time.time()



        for filename in os.listdir(WATCH_PATH):

            file_path = os.path.join(WATCH_PATH, filename)

            clean_name = self.clean_station_name(filename)

            

            if not clean_name: continue



            try:

                with open(file_path, 'r', errors='ignore') as f:

                    content = f.read()

                    # Find dates (YYYY-MM-DD or DD-MM-YYYY)

                    dates = re.findall(r'\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{4}', content)

                    

                    if dates:

                        # Convert to timestamp to find the latest

                        parsed_dates = [pd.to_datetime(d, dayfirst=True) for d in dates]

                        latest_date = max(parsed_dates)

                        

                        # Store only the newest record for this station

                        if clean_name not in station_data or latest_date > station_data[clean_name]:

                            station_data[clean_name] = latest_date

            except Exception as e:

                print(f"Error reading {filename}: {e}")



        self.generate_report(station_data)



    def generate_report(self, data):

        # This converts the data into a clean table for you to see

        print("\n--- UPDATED STATION STATUS ---")

        for station, last_date in sorted(data.items()):

            status = "Online" if (pd.Timestamp.now() - last_date).days < 1 else "Delayed"

            print(f"{station:25} | {last_date.date()} | {status}")



# --- START MONITORING ---

if __name__ == "__main__":

    if not os.path.exists(WATCH_PATH):

        os.makedirs(WATCH_PATH)

        

    event_handler = StationHandler()

    observer = Observer()

    observer.schedule(event_handler, WATCH_PATH, recursive=False)

    observer.start()

    print(f"Monitoring folder: {WATCH_PATH}")

    print("Drop files into the folder to see updates...")



    try:

        while True:

            time.sleep(1)

    except KeyboardInterrupt:

        observer.stop()

    observer.join()