"""
Data migration: load Bloomberg data from fixture.
Imports all assets, fields, field groups, data points, positions, and NAV entries.
"""
import os
from django.db import migrations
from django.core.management import call_command


def load_fixture(apps, schema_editor):
    fixture_path = os.path.join(
        os.path.dirname(os.path.dirname(__file__)),
        'fixtures', 'bloomberg_data.json'
    )
    if os.path.exists(fixture_path):
        call_command('loaddata', fixture_path, verbosity=1)


def reverse_load(apps, schema_editor):
    # On reverse, clear the tables (optional — won't delete if data was modified)
    pass


class Migration(migrations.Migration):
    dependencies = [
        ('bloomberg', '0004_add_position_snapshot'),
    ]

    operations = [
        migrations.RunPython(load_fixture, reverse_load),
    ]
