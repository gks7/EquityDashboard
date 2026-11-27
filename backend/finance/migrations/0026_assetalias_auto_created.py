from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('finance', '0025_utm_portfolio'),
    ]

    operations = [
        migrations.AddField(
            model_name='assetalias',
            name='auto_created',
            field=models.BooleanField(
                default=False,
                help_text='Created by the performance engine from a Portfolio ticker that matched no asset. '
                          'Check the class / sub-class, then untick to clear the Conciliação notice.'),
        ),
    ]
