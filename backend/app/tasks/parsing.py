from celery import Celery
import boto3
import zipfile
import os
import shutil
from app.services.impact.parser import parse_directory_to_neo4j

# Connect Celery to Redis
celery_app = Celery('ripple_tasks', broker='redis://localhost:6379/0')

# Connect to local MinIO
s3 = boto3.client(
    's3',
    endpoint_url='http://localhost:9000',
    aws_access_key_id='ripple',
    aws_secret_access_key='ripple123'
)

@celery_app.task
def process_uploaded_project(file_key: str, project_id: str):
    """
    Background task triggered after a user uploads a ZIP file.
    """
    local_zip_path = f"/tmp/{file_key}"
    extract_dir = f"/tmp/extracted_{file_key}"

    try:
        # 1. Download ZIP from MinIO
        s3.download_file('ripple-projects', file_key, local_zip_path)

        # 2. Extract ZIP
        with zipfile.ZipFile(local_zip_path, 'r') as zip_ref:
            zip_ref.extractall(extract_dir)

        # 3. Trigger the Parser & Neo4j Ingestion we just wrote!
        node_count, rel_count = parse_directory_to_neo4j(extract_dir, project_id)
        print(f"Graph Built! Saved {node_count} nodes and {rel_count} relations to Neo4j.")

        return {"status": "success", "nodes": node_count, "relations": rel_count}

    except Exception as e:
        print(f"Parsing failed: {e}")
        return {"status": "error", "message": str(e)}

    finally:
        # 4. Cleanup temporary files so we don't fill up the server's hard drive
        if os.path.exists(local_zip_path):
            os.remove(local_zip_path)
        if os.path.exists(extract_dir):
            shutil.rmtree(extract_dir)