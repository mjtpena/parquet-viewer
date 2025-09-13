#!/usr/bin/env python3
"""
Generate simple test files in various formats
"""

import json
import random
import os
from datetime import datetime, timedelta

# Create test-files directory
os.makedirs('test-files', exist_ok=True)

# Generate sample data
data = []
departments = ['Engineering', 'Marketing', 'Sales', 'HR']
start_date = datetime(2020, 1, 1)

for i in range(1, 101):
    record = {
        'id': i,
        'name': f'Person_{i}',
        'age': random.randint(18, 80),
        'salary': random.randint(30000, 150000),
        'department': random.choice(departments),
        'is_active': random.choice([True, False]),
        'join_date': (start_date + timedelta(days=i)).isoformat()
    }
    data.append(record)

print("Generating test files...")

# 1. JSON Lines file
try:
    with open('test-files/sample.jsonl', 'w') as f:
        for record in data:
            f.write(json.dumps(record) + '\n')
    print("✅ Generated sample.jsonl")
except Exception as e:
    print(f"❌ Failed to generate JSONL: {e}")

# 2. NDJSON file (same as JSONL but different extension)
try:
    with open('test-files/sample.ndjson', 'w') as f:
        for record in data:
            f.write(json.dumps(record) + '\n')
    print("✅ Generated sample.ndjson")
except Exception as e:
    print(f"❌ Failed to generate NDJSON: {e}")

# 3. CSV file
try:
    with open('test-files/sample.csv', 'w') as f:
        # Header
        f.write('id,name,age,salary,department,is_active,join_date\n')
        # Data
        for record in data:
            f.write(f"{record['id']},{record['name']},{record['age']},{record['salary']},{record['department']},{record['is_active']},{record['join_date']}\n")
    print("✅ Generated sample.csv")
except Exception as e:
    print(f"❌ Failed to generate CSV: {e}")

# 4. Regular JSON file
try:
    with open('test-files/sample.json', 'w') as f:
        json.dump(data, f, indent=2)
    print("✅ Generated sample.json")
except Exception as e:
    print(f"❌ Failed to generate JSON: {e}")

print("\nTest files generated in test-files/ directory")

# List generated files
print("\nGenerated files:")
for file in sorted(os.listdir('test-files')):
    if file.endswith(('.jsonl', '.ndjson', '.csv', '.json')):
        size = os.path.getsize(f'test-files/{file}')
        print(f"  📁 {file} ({size} bytes)")

print(f"\nTotal records per file: {len(data)}")
print("\nYou can now test these files with your Multi-Format Data Viewer!")
print("Open the application and try uploading these test files.")