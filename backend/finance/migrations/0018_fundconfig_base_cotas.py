from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('finance', '0017_dailycash_fundconfig_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='fundconfig',
            name='mtd_base_cota',
            field=models.FloatField(blank=True, default=1.14324, null=True),
        ),
        migrations.AddField(
            model_name='fundconfig',
            name='ytd_base_cota',
            field=models.FloatField(blank=True, default=1.10964, null=True),
        ),
    ]
