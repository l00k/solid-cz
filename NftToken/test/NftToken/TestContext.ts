import { SampleToken } from '@/SampleToken';
import colors from 'colors';
import { ethers } from 'hardhat';
import { BaseTestContext } from '../helpers/BaseTestContext';



export class TestContext
    extends BaseTestContext
{
    
    public nftToken : SampleToken;
    
    
    
    public async initNftTokenContract ()
    {
        this.nftToken = await this._deployContract(
            'SampleToken',
            'SToken',
            'STK',
            'https://example.com/'
        );
        
        return this.nftToken;
    }
    
    public async displayDetails (label : string = 'details')
    {
        const block = await ethers.provider.getBlock('latest');
        
        console.log(
            colors.red('### ' + label),
        );
        
        console.log();
    }
}
