import requests
import json
from typing import Dict, Optional
from urllib.parse import urljoin

from proxy.config.settings import (
    API_HOST,
    API_PORT,
    API_ENDPOINTS,
    SSL_VERIFY,
    MAX_RETRIES,
    RETRY_DELAY
)
from proxy.utils.logger import logger

class APIHandler:
    def __init__(self):
        self.base_url = f"{API_HOST}:{API_PORT}"
        self.session = requests.Session()
        self.session.verify = SSL_VERIFY
        
        # Set up retry strategy
        retry_strategy = requests.adapters.Retry(
            total=MAX_RETRIES,
            backoff_factor=RETRY_DELAY,
            status_forcelist=[500, 502, 503, 504]
        )
        adapter = requests.adapters.HTTPAdapter(max_retries=retry_strategy)
        self.session.mount("http://", adapter)
        self.session.mount("https://", adapter)
    
    def _make_request(
        self,
        method: str,
        endpoint: str,
        data: Optional[Dict] = None,
        params: Optional[Dict] = None
    ) -> Dict:
        """Make an HTTP request to the API"""
        url = urljoin(self.base_url, endpoint)
        
        try:
            response = self.session.request(
                method=method,
                url=url,
                json=data,
                params=params
            )
            response.raise_for_status()
            return response.json()
            
        except requests.exceptions.RequestException as e:
            logger.error(f"API request failed: {e}")
            return {
                "status": "error",
                "error": str(e)
            }
    
    def send_task_result(self, task_id: str, result: Dict) -> Dict:
        """Send task execution result back to API"""
        endpoint = API_ENDPOINTS["emulator_logs"].replace(":taskId", task_id)
        return self._make_request("POST", endpoint, data=result)
    
    def update_task_status(self, task_id: str, status: Dict) -> Dict:
        """Update task status in API"""
        endpoint = API_ENDPOINTS["emulator_status"].replace(":taskId", task_id)
        return self._make_request("POST", endpoint, data=status)
    
    def get_pending_tasks(self) -> Dict:
        """Get list of pending tasks from API"""
        return self._make_request("GET", API_ENDPOINTS["terminal_execute"])
    
    def send_device_status(self, serial: str, status: Dict) -> Dict:
        """Send device status to API"""
        endpoint = API_ENDPOINTS["emulator_status"].replace(":serial", serial)
        return self._make_request("POST", endpoint, data=status)
    
    def send_error(self, error: str, context: Optional[Dict] = None) -> Dict:
        """Send error information to API"""
        data = {
            "error": error,
            "context": context or {}
        }
        return self._make_request("POST", "/api/errors", data=data)
    
    def healthcheck(self) -> bool:
        """Check if API is accessible"""
        try:
            response = self._make_request("GET", "/health")
            return response.get("status") == "healthy"
        except:
            return False 