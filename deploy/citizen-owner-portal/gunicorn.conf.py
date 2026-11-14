"""Bound resource use and avoid request URLs or credentials in access logs."""
import os

bind = "0.0.0.0:" + os.environ.get("PORT", "10000")
workers = 2
worker_class = "gthread"
threads = 2
timeout = 45
graceful_timeout = 30
keepalive = 3
preload_app = False
accesslog = None
errorlog = "-"
loglevel = "warning"
max_requests = 1500
max_requests_jitter = 100
limit_request_line = 4094
limit_request_fields = 64
limit_request_field_size = 8190
