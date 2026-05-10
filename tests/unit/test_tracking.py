import sys
import os
import unittest
from datetime import datetime, timedelta

# Add backend to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../backend')))

from app import app
from tracking.routes import orders_db

class TestTrackingRoutes(unittest.TestCase):
    def setUp(self):
        self.app = app.test_client()
        self.app.testing = True
        # Clear mock db before each test
        orders_db.clear()

    def test_tracking_initial_status(self):
        # First request initializes order with current time
        response = self.app.get('/api/track/123')
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        
        self.assertEqual(data['order_id'], '123')
        self.assertEqual(data['status'], 'pending')
        self.assertLess(data['elapsed_minutes'], 2)

    def test_tracking_brewing_status(self):
        # Manually inject an order created 3 minutes ago
        created_at = datetime.now() - timedelta(minutes=3)
        orders_db['124'] = {'created_at': created_at}
        
        response = self.app.get('/api/track/124')
        data = response.get_json()
        
        self.assertEqual(data['status'], 'brewing')
        self.assertTrue(2 <= data['elapsed_minutes'] < 4)

    def test_tracking_delivering_status(self):
        # Manually inject an order created 5 minutes ago
        created_at = datetime.now() - timedelta(minutes=5)
        orders_db['125'] = {'created_at': created_at}
        
        response = self.app.get('/api/track/125')
        data = response.get_json()
        
        self.assertEqual(data['status'], 'delivering')
        self.assertTrue(4 <= data['elapsed_minutes'] < 6)

    def test_tracking_done_status(self):
        # Manually inject an order created 7 minutes ago
        created_at = datetime.now() - timedelta(minutes=7)
        orders_db['126'] = {'created_at': created_at}
        
        response = self.app.get('/api/track/126')
        data = response.get_json()
        
        self.assertEqual(data['status'], 'done')
        self.assertGreaterEqual(data['elapsed_minutes'], 6)

if __name__ == '__main__':
    unittest.main()
