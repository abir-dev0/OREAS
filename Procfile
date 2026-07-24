release: python manage.py migrate --noinput
web: gunicorn oreas_server.wsgi:application --bind 0.0.0.0:$PORT
