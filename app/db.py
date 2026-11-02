import os
import psycopg2
import psycopg2.extras
from psycopg2 import pool

DSN = os.environ.get(
    "DATABASE_URL",
    "host=127.0.0.1 dbname=app user=kb_users password=trustmeall port=5432",
)

# Создаем пул из 10 соединений
try:
    db_pool = psycopg2.pool.SimpleConnectionPool(1, 10, DSN)
except Exception as e:
    print("Ошибка подключения к БД:", e)
    db_pool = None

def get_conn():
    return db_pool.getconn()

def release_conn(conn):
    db_pool.putconn(conn)

def query(sql, params=(), one=False):
    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()
            conn.commit()
            return (rows[0] if rows else None) if one else rows
    finally:
        release_conn(conn)

def execute(sql, params=()):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            conn.commit()
            return cur.rowcount
    finally:
        release_conn(conn)
