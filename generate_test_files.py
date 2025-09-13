#!/usr/bin/env python3
"""
Generate test files in various formats for testing the Multi-Format Data Viewer
"""

import pandas as pd
import numpy as np
import json
import os

# Create test-files directory
os.makedirs('test-files', exist_ok=True)

# Sample data
data = {
    'id': range(1, 101),
    'name': [f'Person_{i}' for i in range(1, 101)],
    'age': np.random.randint(18, 80, 100),
    'salary': np.random.randint(30000, 150000, 100),
    'department': np.random.choice(['Engineering', 'Marketing', 'Sales', 'HR'], 100),
    'is_active': np.random.choice([True, False], 100),
    'join_date': pd.date_range('2020-01-01', periods=100, freq='D')[:100]
}

df = pd.DataFrame(data)

print("Generating test files...")

# 1. Parquet file
try:
    df.to_parquet('test-files/sample.parquet', index=False)
    print("✅ Generated sample.parquet")
except Exception as e:
    print(f"❌ Failed to generate Parquet: {e}")

# 2. JSON Lines file
try:
    with open('test-files/sample.jsonl', 'w') as f:
        for _, row in df.iterrows():
            # Convert datetime to string for JSON serialization
            row_dict = row.to_dict()
            row_dict['join_date'] = row_dict['join_date'].isoformat()
            f.write(json.dumps(row_dict) + '\n')
    print("✅ Generated sample.jsonl")
except Exception as e:
    print(f"❌ Failed to generate JSONL: {e}")

# 3. CSV file (for comparison)
try:
    df.to_csv('test-files/sample.csv', index=False)
    print("✅ Generated sample.csv")
except Exception as e:
    print(f"❌ Failed to generate CSV: {e}")

# 4. Try to generate Arrow file
try:
    import pyarrow as pa
    import pyarrow.feather as feather
    
    table = pa.Table.from_pandas(df)
    feather.write_feather(table, 'test-files/sample.arrow')
    print("✅ Generated sample.arrow")
except ImportError:
    print("⚠️ PyArrow not available - skipping Arrow file generation")
except Exception as e:
    print(f"❌ Failed to generate Arrow: {e}")

# 5. Try to generate Avro file  
try:
    import fastavro
    
    schema = {
        "type": "record",
        "name": "Employee",
        "fields": [
            {"name": "id", "type": "int"},
            {"name": "name", "type": "string"},
            {"name": "age", "type": "int"},
            {"name": "salary", "type": "int"},
            {"name": "department", "type": "string"},
            {"name": "is_active", "type": "boolean"},
            {"name": "join_date", "type": "string"}
        ]
    }
    
    records = []
    for _, row in df.iterrows():
        record = row.to_dict()
        record['join_date'] = record['join_date'].isoformat()
        records.append(record)
    
    with open('test-files/sample.avro', 'wb') as f:
        fastavro.writer(f, schema, records)
    print("✅ Generated sample.avro")
except ImportError:
    print("⚠️ FastAvro not available - skipping Avro file generation")
except Exception as e:
    print(f"❌ Failed to generate Avro: {e}")

print("\nTest files generated in test-files/ directory")
print("You can now test these files with your Multi-Format Data Viewer!")

# List generated files
print("\nGenerated files:")
for file in os.listdir('test-files'):
    if file.endswith(('.parquet', '.jsonl', '.csv', '.arrow', '.avro')):
        size = os.path.getsize(f'test-files/{file}')
        print(f"  📁 {file} ({size} bytes)")