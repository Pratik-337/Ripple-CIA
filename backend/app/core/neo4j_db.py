from neo4j import GraphDatabase
import os

# Configuration
NEO4J_URI = os.getenv("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "ripple123")

class Neo4jConnection:
    def __init__(self):
        try:
            self.driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
            # Verify connection
            self.driver.verify_connectivity()
            print("Successfully connected to Neo4j!")
        except Exception as e:
            print(f"Failed to connect to Neo4j: {e}")
            self.driver = None

    def close(self):
        if self.driver:
            self.driver.close()

    def get_session(self):
        if self.driver:
            return self.driver.session()
        raise Exception("Neo4j driver not initialized.")

# Create a global instance
neo4j_db = Neo4jConnection()