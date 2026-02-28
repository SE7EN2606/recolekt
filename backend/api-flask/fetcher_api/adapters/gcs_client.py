# fetcher_api/adapters/gcs_client.py

import os
import time
import json
import logging
import tempfile
from urllib.parse import urlparse

import requests
from google.cloud import storage
from google.cloud.exceptions import GoogleCloudError, ServiceUnavailable, InternalServerError

from config.settings import GCS_CREDENTIALS_PATH, GCS_ANALYSIS_BUCKET

logger = logging.getLogger("storage")


class GCSClient:
    def __init__(self, credentials_path=None):
        self.credentials_path = credentials_path or GCS_CREDENTIALS_PATH
        self.analysis_bucket_name = GCS_ANALYSIS_BUCKET

        self.client = None
        self.available = False
        self._initialize()

    def _initialize(self):
        try:
            logger.info("🔍 checking GCP credentials...")
            
            # ✅ Option 1: Check for JSON in environment variable (Railway/production)
            gcs_json = os.environ.get('GCS_CREDENTIALS_JSON')
            if gcs_json:
                logger.info("🔍 Using GCS_CREDENTIALS_JSON from environment")
                try:
                    creds_data = json.loads(gcs_json)
                    project_id = creds_data.get('project_id')
                    client_email = creds_data.get('client_email')
                    
                    logger.info(f"🔍 Project: {project_id}")
                    logger.info(f"🔍 Service Account: {client_email}")
                    
                    if not creds_data.get('private_key'):
                        raise ValueError("Missing private_key in credentials JSON")
                    
                    # ✅ Write to temp file for google.cloud.storage
                    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
                        json.dump(creds_data, f)
                        temp_creds_path = f.name
                    
                    self.client = storage.Client.from_service_account_json(temp_creds_path)
                    
                    # Clean up temp file
                    try:
                        os.unlink(temp_creds_path)
                    except:
                        pass
                        
                except json.JSONDecodeError as e:
                    logger.error(f"❌ Invalid JSON in GCS_CREDENTIALS_JSON: {e}")
                    return False
            
            # ✅ Option 2: Use credentials file for local dev
            elif self.credentials_path and os.path.exists(self.credentials_path):
                logger.info(f"🔍 Loading GCS credentials from: {self.credentials_path}")
                
                # Validate JSON structure
                with open(self.credentials_path, 'r') as f:
                    creds_data = json.load(f)
                    project_id = creds_data.get('project_id')
                    client_email = creds_data.get('client_email')
                    
                    logger.info(f"🔍 Project: {project_id}")
                    logger.info(f"🔍 Service Account: {client_email}")
                    
                    if not creds_data.get('private_key'):
                        raise ValueError("Missing private_key in credentials JSON")
                
                # Create client
                self.client = storage.Client.from_service_account_json(
                    self.credentials_path
                )
            
            # ✅ Option 3: Use Cloud Run's default service account
            else:
                logger.warning("⚠️ Google Cloud Credentials not found. GCS features will be DISABLED.")
                return False

            # Verify bucket access
            logger.info(f"🔍 Testing access to bucket: {self.analysis_bucket_name}")
            bucket = self.client.bucket(self.analysis_bucket_name)

            if bucket.exists():
                self.available = True
                logger.info(f"✅ GCS connected to bucket: {self.analysis_bucket_name}")
                return True

            logger.error(f"❌ GCS bucket not found: {self.analysis_bucket_name}")
            return False

        except Exception as e:
            logger.error(f"❌ GCS initialization failed: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return False

    # ... rest of the class stays the same ...
    
    # [Keep all other methods unchanged - upload_file, download_blob_to_file, etc.]

    @staticmethod
    def _public_url(bucket_name: str, blob_name: str) -> str:
        return f"https://storage.googleapis.com/{bucket_name}/{blob_name}"

    @staticmethod
    def _parse_gs_uri(gs_uri: str) -> tuple[str, str]:
        if not gs_uri.startswith("gs://"):
            raise ValueError(f"Expected gs:// URI, got: {gs_uri}")
        without_scheme = gs_uri[len("gs://"):]
        bucket_name, blob_name = without_scheme.split("/", 1)
        return bucket_name, blob_name

    @staticmethod
    def _parse_gcs_public_url(url: str) -> tuple[str, str]:
        """
        Supports:
          - https://storage.googleapis.com/<bucket>/<blob>
          - https://<bucket>.storage.googleapis.com/<blob>
        """
        p = urlparse(url)
        host = p.netloc
        path = p.path.lstrip("/")

        # https://storage.googleapis.com/<bucket>/<blob>
        if host == "storage.googleapis.com":
            parts = path.split("/", 1)
            if len(parts) != 2:
                raise ValueError(f"Unrecognized GCS URL format: {url}")
            return parts[0], parts[1]

        # https://<bucket>.storage.googleapis.com/<blob>
        if host.endswith(".storage.googleapis.com"):
            bucket_name = host.split(".storage.googleapis.com", 1)[0]
            if not bucket_name or not path:
                raise ValueError(f"Unrecognized GCS URL format: {url}")
            return bucket_name, path

        raise ValueError(f"Unrecognized GCS URL host: {host}")

    def upload_file(
        self,
        local_file_path,
        gcs_bucket_name,
        gcs_blob_name,
        content_type=None,
        timeout=600,
        retries=5,
        retry_wait=1.2,
    ):
        """
        Upload a file to GCS with retry logic.
        """
        if not self.available:
            return None

        bucket = self.client.bucket(gcs_bucket_name)
        blob = bucket.blob(gcs_blob_name)

        if content_type:
            blob.content_type = content_type

        for attempt in range(1, retries + 1):
            try:
                blob.upload_from_filename(
                    local_file_path,
                    timeout=timeout,
                    retry=None
                )

                url = self._public_url(gcs_bucket_name, gcs_blob_name)

                logger.info(
                    f"Uploaded: gs://{gcs_bucket_name}/{gcs_blob_name}"
                )
                return url

            except (ServiceUnavailable, InternalServerError, GoogleCloudError, ConnectionError) as e:
                logger.error(
                    f"GCS upload failed (attempt {attempt}/{retries}): {e}"
                )

                if attempt == retries:
                    logger.error("Upload permanently failed.")
                    return None

                time.sleep(retry_wait * attempt)

            except Exception as e:
                logger.error(f"Unexpected GCS upload error: {e}")
                return None

    def download_blob_to_file(
        self,
        gcs_bucket_name: str,
        gcs_blob_name: str,
        local_file_path: str,
        timeout=600,
        retries=5,
        retry_wait=1.2,
    ) -> str | None:
        """
        Download a GCS object (bucket/blob) to a local path.
        Returns local_file_path on success, None on failure.
        """
        if not self.available:
            return None

        os.makedirs(os.path.dirname(local_file_path), exist_ok=True)

        bucket = self.client.bucket(gcs_bucket_name)
        blob = bucket.blob(gcs_blob_name)

        for attempt in range(1, retries + 1):
            try:
                blob.download_to_filename(local_file_path, timeout=timeout, retry=None)
                logger.info(f"Downloaded: gs://{gcs_bucket_name}/{gcs_blob_name} -> {local_file_path}")
                return local_file_path

            except (ServiceUnavailable, InternalServerError, GoogleCloudError, ConnectionError) as e:
                logger.error(
                    f"GCS download failed (attempt {attempt}/{retries}): {e}"
                )
                if attempt == retries:
                    logger.error("Download permanently failed.")
                    return None
                time.sleep(retry_wait * attempt)

            except Exception as e:
                logger.error(f"Unexpected GCS download error: {e}")
                return None

    def download_gs_uri_to_file(
        self,
        gs_uri: str,
        local_file_path: str,
        timeout=600,
        retries=5,
        retry_wait=1.2,
    ) -> str | None:
        bucket_name, blob_name = self._parse_gs_uri(gs_uri)
        return self.download_blob_to_file(
            bucket_name,
            blob_name,
            local_file_path,
            timeout=timeout,
            retries=retries,
            retry_wait=retry_wait,
        )

    def download_public_url_to_file(
        self,
        url: str,
        local_file_path: str,
        timeout=30,
        retries=3,
        retry_wait=1.2,
    ) -> str | None:
        """
        Download a public HTTPS URL (like storage.googleapis.com/...) to local_file_path.
        Returns local_file_path on success, None on failure.
        """
        os.makedirs(os.path.dirname(local_file_path), exist_ok=True)

        for attempt in range(1, retries + 1):
            try:
                with requests.get(url, stream=True, timeout=timeout) as r:
                    r.raise_for_status()
                    with open(local_file_path, "wb") as f:
                        for chunk in r.iter_content(chunk_size=1024 * 1024):
                            if chunk:
                                f.write(chunk)

                logger.info(f"Downloaded URL -> {local_file_path}: {url}")
                return local_file_path

            except Exception as e:
                logger.error(f"URL download failed (attempt {attempt}/{retries}): {e}")
                if attempt == retries:
                    return None
                time.sleep(retry_wait * attempt)

    def download_gcs_url_to_file(
        self,
        url: str,
        local_file_path: str,
        timeout=600,
        retries=5,
        retry_wait=1.2,
    ) -> str | None:
        """
        If you prefer authenticated download using the GCS client,
        this parses the public URL into (bucket, blob) and downloads via the SDK.
        """
        if not self.available:
            return None

        bucket_name, blob_name = self._parse_gcs_public_url(url)
        return self.download_blob_to_file(
            bucket_name,
            blob_name,
            local_file_path,
            timeout=timeout,
            retries=retries,
            retry_wait=retry_wait,
        )


# Singleton
gcs_client = GCSClient()
